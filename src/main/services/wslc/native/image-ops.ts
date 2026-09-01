import { basename } from 'node:path'
import type { CommandResult } from '@shared/schemas'
import { logError, logInfo } from '../../logger'
import { allocStreamId, registerStream, releaseStream, type StreamSink } from '../streams'
import { hrHex, hrOk, Keep, registerCallback, unregisterCallback, type WslcSdk } from './bindings'
import { splitImageRef } from './images'
import { ProgressTracker } from './progress'
import { registryAuthFor, storedRegistryAuthFor } from './registry'
import { acquireNativeSession, callNative } from './session'

/**
 * Operações de imagem da sessão nativa (Fases 4 e 5): pull/push com progresso
 * estruturado por camada (WslcContainerImageProgressCallback), tag e
 * import/load de tarball.
 *
 * Regras por probe (SDK 2.9.4): o callback de progresso pode CANCELAR o
 * pull/push retornando E_ABORT (a imagem/manifest parcial não fica); pull de
 * ref inexistente devolve 0x80040601 com mensagem legível; import/load não
 * emitem progresso. Push: registryAuth é OBRIGATÓRIO (NULL = E_INVALIDARG;
 * anônimo = base64 de "{}"), o status das mensagens vem sempre 0 (bytes é que
 * indicam o estágio) e só registries locais (127.0.0.1) aceitam HTTP — os
 * demais exigem HTTPS.
 */

const E_ABORT = 0x80004004
const PROGRESS_INTERVAL_MS = 120
// O invoke que devolve o id do stream precisa resolver no renderer antes dos
// primeiros eventos chegarem (mesma corrida do streamNativeLogs da Fase 2).
const RENDERER_REGISTER_DELAY_MS = 100

const rendererReady = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, RENDERER_REGISTER_DELAY_MS))

/** Callback nativo devolve HRESULT — S_OK continua, E_ABORT cancela o pull. */
type ProgressCallbackFn = (msgPtr: unknown, context: unknown) => number

interface StreamJob {
  streamId: number
  sink: StreamSink
  cancelled: { value: boolean }
}

function startJob(sink: StreamSink): StreamJob {
  const streamId = allocStreamId()
  const cancelled = { value: false }
  registerStream(streamId, {
    kill: () => {
      cancelled.value = true
    }
  })
  return { streamId, sink, cancelled }
}

function finishJob(job: StreamJob, code: number, lastLine: string): void {
  releaseStream(job.streamId)
  if (lastLine) job.sink.data({ id: job.streamId, chunk: `${lastLine}\n` })
  job.sink.exit({ id: job.streamId, code })
}

interface TransferSpec {
  /** "Pull" | "Push" — usado nos logs e nas linhas do stream. */
  label: string
  firstLine: string
  doneLine: string
  cancelLine: string
  tracker: ProgressTracker
  invoke: (
    sdk: WslcSdk,
    session: unknown,
    keep: Keep,
    cbId: bigint,
    errOut: (string | null)[]
  ) => Promise<number>
}

/**
 * Esqueleto comum de pull/push: stream com progresso estruturado por camada,
 * throttle de snapshots e cancelamento real via E_ABORT no callback.
 */
function runImageTransfer(ref: string, sink: StreamSink, spec: TransferSpec): number {
  const job = startJob(sink)
  const { streamId, cancelled } = job
  logInfo('native', `${spec.label} nativo #${streamId} iniciado — ${ref}`)

  void (async () => {
    const keep = new Keep()
    let cbId: bigint | null = null
    let flushTimer: ReturnType<typeof setInterval> | undefined
    try {
      await rendererReady()
      const { sdk, handle: session } = await acquireNativeSession()
      const tracker = spec.tracker

      let lastEmit = 0
      let dirty = false
      const emit = (): void => {
        dirty = false
        lastEmit = Date.now()
        sink.progress?.({ id: streamId, layers: tracker.snapshot() })
      }
      const onProgress: ProgressCallbackFn = (msgPtr) => {
        if (cancelled.value) return E_ABORT | 0
        if (msgPtr && tracker.update(sdk.decodeProgress(msgPtr))) {
          // Imagens grandes geram rajadas de mensagens — snapshots são
          // limitados a um a cada PROGRESS_INTERVAL_MS (flush pelo timer).
          if (Date.now() - lastEmit >= PROGRESS_INTERVAL_MS) emit()
          else dirty = true
        }
        return 0
      }
      cbId = registerCallback(onProgress as never, sdk.types['ImageProgressCallback'])
      flushTimer = setInterval(() => {
        if (dirty) emit()
      }, PROGRESS_INTERVAL_MS)
      flushTimer.unref()

      sink.data({ id: streamId, chunk: `${spec.firstLine}\n` })
      const errOut: (string | null)[] = [null]
      const startedAt = Date.now()
      const hr = await spec.invoke(sdk, session, keep, cbId, errOut)
      clearInterval(flushTimer)
      emit()

      if (cancelled.value || hr >>> 0 === E_ABORT) {
        logInfo('native', `${spec.label} nativo #${streamId} cancelado (${ref})`)
        finishJob(job, 1, spec.cancelLine)
      } else if (hrOk(hr)) {
        logInfo(
          'native',
          `${spec.label} nativo #${streamId} concluído em ${Date.now() - startedAt}ms (${ref})`
        )
        finishJob(job, 0, spec.doneLine)
      } else {
        const message = errOut[0] || `${spec.label} falhou: ${hrHex(hr)}`
        logError('native', `${spec.label} nativo #${streamId} falhou (${ref})`, message)
        finishJob(job, 1, `Erro: ${message}`)
      }
    } catch (e) {
      if (flushTimer) clearInterval(flushTimer)
      const message = e instanceof Error ? e.message : String(e)
      logError('native', `${spec.label} nativo #${streamId} falhou (${ref})`, message)
      finishJob(job, -1, `Erro: ${message}`)
    } finally {
      // Margem para callbacks ainda enfileirados no loop antes do unregister.
      const id = cbId
      if (id !== null) {
        setImmediate(() => {
          try {
            unregisterCallback(id)
          } catch {
            // já removido
          }
        })
      }
    }
  })()

  return streamId
}

/**
 * Pull nativo com progresso estruturado. Devolve o id do stream na hora; o
 * download roda em background emitindo snapshots por camada no sink. Usa as
 * credenciais do login quando o registry da ref tem uma guardada.
 */
export function pullNativeImage(ref: string, sink: StreamSink): number {
  return runImageTransfer(ref, sink, {
    label: 'Pull',
    firstLine: `Baixando ${ref} (motor nativo)…`,
    doneLine: `Pull de ${ref} concluído.`,
    cancelLine: 'Pull cancelado.',
    // A 1ª mensagem do pull usa a TAG como id ("latest") — não é camada.
    tracker: new ProgressTracker([splitImageRef(ref).tag || 'latest']),
    invoke: (sdk, session, keep, cbId, errOut) => {
      // No pull o auth é opcional — anônimo continua NULL (comportamento validado).
      const auth = storedRegistryAuthFor(ref)
      return callNative(
        sdk.raw['WslcPullSessionImage'],
        session,
        {
          uri: keep.ansi(ref),
          progressCallback: cbId,
          progressCallbackContext: null,
          registryAuth: auth ? keep.ansi(auth) : null
        },
        errOut
      )
    }
  })
}

/**
 * Push nativo com progresso estruturado (WslcPushSessionImage). O registry
 * vem da própria ref (ex.: "127.0.0.1:5000/app:latest"); as credenciais do
 * login viram o blob X-Registry-Auth (sem login, vai anônimo).
 */
export function pushNativeImage(ref: string, sink: StreamSink): number {
  return runImageTransfer(ref, sink, {
    label: 'Push',
    firstLine: `Enviando ${ref} (motor nativo)…`,
    doneLine: `Push de ${ref} concluído.`,
    cancelLine: 'Push cancelado.',
    tracker: new ProgressTracker([], 'push'),
    invoke: (sdk, session, keep, cbId, errOut) =>
      callNative(
        sdk.raw['WslcPushSessionImage'],
        session,
        {
          image: keep.ansi(ref),
          registryAuth: keep.ansi(registryAuthFor(ref)),
          progressCallback: cbId,
          progressCallbackContext: null
        },
        errOut
      )
  })
}

type TarballOp = (sdk: WslcSdk, session: unknown, keep: Keep, errOut: (string | null)[]) => Promise<number>

/** Esqueleto comum de load/import: stream com texto + exit (sem progresso no SDK). */
function runTarballStream(sink: StreamSink, firstLine: string, doneLine: string, op: TarballOp): number {
  const job = startJob(sink)
  void (async () => {
    const keep = new Keep()
    try {
      await rendererReady()
      const { sdk, handle: session } = await acquireNativeSession()
      sink.data({ id: job.streamId, chunk: `${firstLine}\n` })
      const errOut: (string | null)[] = [null]
      const hr = await op(sdk, session, keep, errOut)
      if (hrOk(hr)) {
        logInfo('native', doneLine)
        finishJob(job, 0, doneLine)
      } else {
        const message = errOut[0] || `Falhou: ${hrHex(hr)}`
        logError('native', firstLine, message)
        finishJob(job, 1, `Erro: ${message}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logError('native', firstLine, message)
      finishJob(job, -1, `Erro: ${message}`)
    }
  })()
  return job.streamId
}

/** Carrega um tarball salvo por `image save` (repõe repositório e tag originais). */
export function loadNativeImage(path: string, sink: StreamSink): number {
  return runTarballStream(
    sink,
    `Carregando tarball ${basename(path)} (motor nativo)…`,
    `Tarball ${basename(path)} carregado na sessão nativa.`,
    (sdk, session, keep, errOut) =>
      callNative(sdk.raw['WslcLoadSessionImageFromFile'], session, keep.wide(path), null, errOut)
  )
}

/** Importa um tarball de sistema de arquivos como a imagem `ref`. */
export function importNativeImage(path: string, ref: string, sink: StreamSink): number {
  return runTarballStream(
    sink,
    `Importando ${basename(path)} como ${ref} (motor nativo)…`,
    `Imagem ${ref} importada na sessão nativa.`,
    (sdk, session, keep, errOut) =>
      callNative(
        sdk.raw['WslcImportSessionImageFromFile'],
        session,
        keep.ansi(ref),
        keep.wide(path),
        null,
        errOut
      )
  )
}

/** Cria uma tag nova para uma imagem da sessão nativa (WslcTagSessionImage). */
export async function tagNativeImage(source: string, target: string): Promise<CommandResult> {
  const keep = new Keep()
  try {
    const { sdk, handle: session } = await acquireNativeSession()
    const { repository, tag } = splitImageRef(target)
    const errOut: (string | null)[] = [null]
    const hr = await callNative(
      sdk.raw['WslcTagSessionImage'],
      session,
      { image: keep.ansi(source), repo: keep.ansi(repository), tag: keep.ansi(tag || 'latest') },
      errOut
    )
    if (!hrOk(hr)) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr: errOut[0] || `WslcTagSessionImage falhou: ${hrHex(hr)}`
      }
    }
    logInfo('native', `Tag criada: ${source} → ${target}`)
    return { ok: true, code: 0, stdout: '', stderr: '' }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}
