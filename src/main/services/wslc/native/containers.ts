import { mkdirSync, rmSync } from 'node:fs'
import type { CommandResult, ContainerAction, ContainerInfo, RunContainerOptions } from '@shared/schemas'
import { logError, logInfo, logWarn } from '../../logger'
import { splitCommand } from '../run-args'
import { allocStreamId, registerStream, releaseStream, type StreamSink } from '../streams'
import {
  decodeBytes,
  hrHex,
  hrOk,
  Keep,
  registerCallback,
  unregisterCallback,
  type WslcSdk
} from './bindings'
import { formatUnixDate } from './images'
import { formatPortsDisplay, mapNativeState, parsePortSpec, parseVolumeSpec } from './run-spec'
import {
  acquireNativeSession,
  callNative,
  ensureNativeSession,
  sessionStoragePath,
  terminateNativeSession
} from './session'

/**
 * Containers nativos (Fase 2 do ROADMAP).
 *
 * O SDK preview NÃO tem enumeração nem "abrir por ID" — um container só é
 * gerenciável pelo handle criado neste processo. Por isso o app mantém um
 * registro em memória e REMOVE os containers nativos ao fechar (senão viram
 * órfãos permanentes: os registros sobrevivem até ao terminate da sessão e
 * só somem apagando o storage — ver resetNativeSession).
 *
 * Regras por probe (SDK 2.9.4): port mapping exige networking BRIDGED e só
 * TCP; init process com callbacks exige start com WSLC_CONTAINER_START_FLAG_ATTACH.
 */

const NET_BRIDGED = 1
const START_ATTACH = 1
const FLAG_AUTO_REMOVE = 0x1
const FLAG_ENABLE_GPU = 0x2
const DELETE_FORCE = 0x1
const SIGTERM = 15
const SIGKILL = 9
const STOP_TIMEOUT_S = 10
const LOG_CAP = 512 * 1024
const EXEC_TIMEOUT_MS = 10 * 60_000

interface NativeContainer {
  sdk: WslcSdk
  handle: unknown
  /** ID completo (64 hex). A UI usa os 12 primeiros. */
  id: string
  name: string
  image: string
  command: string
  createdAt: number
  portsDisplay: string
  autoRemove: boolean
  /** Buffers/structs que o SDK referencia — vivos pela vida do container. */
  keep: Keep
  callbackIds: bigint[]
  logs: string
  logListeners: Set<(chunk: string) => void>
  exitListeners: Set<(code: number | null) => void>
  exitCode: number | null
}

const registry = new Map<string, NativeContainer>()

function find(query: string): NativeContainer | undefined {
  const q = query.trim()
  return registry.get(q) ?? [...registry.values()].find((c) => c.id.startsWith(q) || c.name === q)
}

function notFound(id: string): CommandResult {
  return {
    ok: false,
    code: 1,
    stdout: '',
    stderr: `Container "${id}" não encontrado na sessão nativa (o app só gerencia containers criados por ele nesta execução).`
  }
}

function failResult(fnName: string, hr: number, message: string | null): CommandResult {
  return {
    ok: false,
    code: 1,
    stdout: '',
    stderr: message || `${fnName} falhou: ${hrHex(hr)}`
  }
}

function check(fnName: string, hr: number): void {
  if (!hrOk(hr)) throw new Error(`${fnName} falhou: ${hrHex(hr)}`)
}

function appendLog(c: NativeContainer, chunk: string): void {
  c.logs += chunk
  if (c.logs.length > LOG_CAP) c.logs = c.logs.slice(-LOG_CAP / 2)
  for (const listener of c.logListeners) listener(chunk)
}

/**
 * Solta os recursos locais: registro/listeners na hora (síncrono) e o handle
 * de forma ASSÍNCRONA — WslcReleaseContainer síncrono deadlocka se um callback
 * de exit estiver na fila do koffi (o SDK espera o callback, o callback espera
 * o event loop, o loop está preso no Release). Com .async o loop fica livre
 * para entregar o callback pendente. Unregister só depois do Release.
 */
function releaseLocal(c: NativeContainer): Promise<void> {
  registry.delete(c.id)
  const callbacks = c.callbackIds
  c.callbackIds = []
  for (const listener of c.exitListeners) listener(c.exitCode)
  c.exitListeners.clear()
  c.logListeners.clear()
  return callNative(c.sdk.raw['WslcReleaseContainer'], c.handle)
    .catch(() => 0)
    .then(() => {
      for (const cb of callbacks) {
        try {
          unregisterCallback(cb)
        } catch {
          // já removido
        }
      }
    })
}

type AllocType = Parameters<WslcSdk['alloc']>[0]

/** Cria e inicia um container nativo a partir das opções do diálogo de run. */
export async function runNativeContainer(opts: RunContainerOptions): Promise<CommandResult> {
  const keep = new Keep()
  const callbackIds: bigint[] = []
  try {
    const { sdk, handle: session } = await acquireNativeSession()

    const ports = (opts.ports ?? [])
      .map((p) => p.trim())
      .filter(Boolean)
      .map(parsePortSpec)
    const volumes = (opts.volumes ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .map(parseVolumeSpec)
    const env = (opts.env ?? []).map((e) => e.trim()).filter(Boolean)
    // --entrypoint no nativo: o init process É o entrypoint — prefixa o comando.
    const argv = [
      ...(opts.entrypoint?.trim() ? splitCommand(opts.entrypoint.trim()) : []),
      ...(opts.command?.trim() ? splitCommand(opts.command.trim()) : [])
    ]

    // Registro criado antes dos callbacks para eles poderem referenciá-lo.
    const record: NativeContainer = {
      sdk,
      handle: null,
      id: '',
      name: opts.name?.trim() ?? '',
      image: opts.image.trim(),
      command: opts.command?.trim() ?? '',
      createdAt: Date.now(),
      portsDisplay: formatPortsDisplay(ports),
      autoRemove: opts.rm,
      keep,
      callbackIds,
      logs: '',
      logListeners: new Set(),
      exitListeners: new Set(),
      exitCode: null
    }

    // Init process: comando/env + callbacks de IO (logs) e exit.
    const ps = keep.hold(sdk.alloc(sdk.types['ProcessSettings'] as AllocType, 1))
    check('WslcInitProcessSettings', sdk.raw['WslcInitProcessSettings'](ps))
    if (argv.length > 0) {
      check(
        'WslcSetProcessSettingsCmdLine',
        sdk.raw['WslcSetProcessSettingsCmdLine'](ps, keep.strArray(argv), argv.length)
      )
    }
    if (env.length > 0) {
      check(
        'WslcSetProcessSettingsEnvVariables',
        sdk.raw['WslcSetProcessSettingsEnvVariables'](ps, keep.strArray(env), env.length)
      )
    }
    if (opts.workdir?.trim()) {
      check(
        'WslcSetProcessSettingsWorkingDirectory',
        sdk.raw['WslcSetProcessSettingsWorkingDirectory'](ps, keep.ansi(opts.workdir.trim()))
      )
    }
    const onIo = registerCallback((_io: number, data: unknown, bytes: number) => {
      const chunk = decodeBytes(data, bytes)
      if (chunk.length > 0) appendLog(record, chunk.toString('utf8'))
    }, sdk.types['StdIOCallback'])
    const onExit = registerCallback((code: number) => {
      record.exitCode = code
      for (const listener of record.exitListeners) listener(code)
      // AUTO_REMOVE: o SDK apaga o registro do container — solta o nosso também.
      if (record.autoRemove) setImmediate(() => releaseLocal(record))
    }, sdk.types['ProcessExitCallback'])
    callbackIds.push(onIo, onExit)
    const cbStruct = keep.struct(sdk.types['ProcessCallbacks'], {
      onStdOut: onIo,
      onStdErr: onIo,
      onExit
    })
    check('WslcSetProcessSettingsCallbacks', sdk.raw['WslcSetProcessSettingsCallbacks'](ps, cbStruct, null))

    // Container settings.
    const cs = keep.hold(sdk.alloc(sdk.types['ContainerSettings'] as AllocType, 1))
    check('WslcInitContainerSettings', sdk.raw['WslcInitContainerSettings'](keep.ansi(record.image), cs))
    if (record.name) {
      check(
        'WslcSetContainerSettingsName',
        sdk.raw['WslcSetContainerSettingsName'](cs, keep.ansi(record.name))
      )
    }
    if (opts.hostname?.trim()) {
      check(
        'WslcSetContainerSettingsHostName',
        sdk.raw['WslcSetContainerSettingsHostName'](cs, keep.ansi(opts.hostname.trim()))
      )
    }
    if (opts.domainname?.trim()) {
      check(
        'WslcSetContainerSettingsDomainName',
        sdk.raw['WslcSetContainerSettingsDomainName'](cs, keep.ansi(opts.domainname.trim()))
      )
    }
    // Port mapping exige BRIDGED; e rede por padrão é o comportamento docker-like.
    check(
      'WslcSetContainerSettingsNetworkingMode',
      sdk.raw['WslcSetContainerSettingsNetworkingMode'](cs, NET_BRIDGED)
    )
    check('WslcSetContainerSettingsInitProcess', sdk.raw['WslcSetContainerSettingsInitProcess'](cs, ps))
    const flags = (opts.rm ? FLAG_AUTO_REMOVE : 0) | (opts.gpus ? FLAG_ENABLE_GPU : 0)
    if (flags !== 0)
      check('WslcSetContainerSettingsFlags', sdk.raw['WslcSetContainerSettingsFlags'](cs, flags))
    if (ports.length > 0) {
      const arr = keep.structArray(
        sdk.types['PortMapping'],
        ports.map((p) => ({ ...p, windowsAddress: null }))
      )
      check(
        'WslcSetContainerSettingsPortMappings',
        sdk.raw['WslcSetContainerSettingsPortMappings'](cs, arr, ports.length)
      )
    }
    const binds = volumes.filter((v) => v.kind === 'bind')
    if (binds.length > 0) {
      const arr = keep.structArray(
        sdk.types['ContainerVolume'],
        binds.map((v) => ({
          windowsPath: keep.wide(v.windowsPath),
          containerPath: keep.ansi(v.containerPath),
          readOnly: v.readOnly ? 1 : 0
        }))
      )
      check(
        'WslcSetContainerSettingsVolumes',
        sdk.raw['WslcSetContainerSettingsVolumes'](cs, arr, binds.length)
      )
    }
    const named = volumes.filter((v) => v.kind === 'named')
    if (named.length > 0) {
      const arr = keep.structArray(
        sdk.types['NamedVolume'],
        named.map((v) => ({
          name: keep.ansi(v.name),
          containerPath: keep.ansi(v.containerPath),
          readOnly: v.readOnly ? 1 : 0
        }))
      )
      check(
        'WslcSetContainerSettingsNamedVolumes',
        sdk.raw['WslcSetContainerSettingsNamedVolumes'](cs, arr, named.length)
      )
    }

    // Create + ID + Start (ATTACH: callbacks consomem os IO handles).
    const contOut: unknown[] = [null]
    const createErr: (string | null)[] = [null]
    const hrCreate = await callNative(sdk.raw['WslcCreateContainer'], session, cs, contOut, createErr)
    if (!hrOk(hrCreate) || !contOut[0]) {
      for (const cb of callbackIds) unregisterCallback(cb)
      return failResult('WslcCreateContainer', hrCreate, createErr[0])
    }
    record.handle = contOut[0]

    // A partir daqui o container EXISTE: qualquer falha precisa deletá-lo,
    // senão vira registro órfão permanente no storage da sessão.
    try {
      const idBuf = Buffer.alloc(65)
      check('WslcGetContainerID', await callNative(sdk.raw['WslcGetContainerID'], record.handle, idBuf))
      record.id = idBuf.toString('utf8').split('\0')[0]
      if (!record.name) record.name = record.id.slice(0, 12)

      const startErr: (string | null)[] = [null]
      const hrStart = await callNative(sdk.raw['WslcStartContainer'], record.handle, START_ATTACH, startErr)
      if (!hrOk(hrStart)) throw new Error(failResult('WslcStartContainer', hrStart, startErr[0]).stderr)
    } catch (e) {
      await callNative(sdk.raw['WslcDeleteContainer'], record.handle, DELETE_FORCE, [null]).catch(() => 0)
      void callNative(sdk.raw['WslcReleaseContainer'], record.handle).catch(() => 0)
      throw e
    }

    registry.set(record.id, record)
    logInfo(
      'native',
      `Container ${record.id.slice(0, 12)} (${record.name}) criado e iniciado — ${record.image}`,
      [record.command && `cmd: ${record.command}`, record.portsDisplay && `portas: ${record.portsDisplay}`]
        .filter(Boolean)
        .join('\n')
    )
    return { ok: true, code: 0, stdout: record.id.slice(0, 12), stderr: '' }
  } catch (e) {
    for (const cb of callbackIds) {
      try {
        unregisterCallback(cb)
      } catch {
        // já removido
      }
    }
    const message = e instanceof Error ? e.message : String(e)
    logError('native', `Falha ao executar container nativo (${opts.image})`, message)
    return { ok: false, code: 1, stdout: '', stderr: message }
  }
}

/** Lista os containers do registro com estado real (WslcGetContainerState). */
export async function listNativeContainers(all: boolean): Promise<ContainerInfo[]> {
  const result: ContainerInfo[] = []
  const newestFirst = Array.from(registry.values()).toSorted((a, b) => b.createdAt - a.createdAt)
  // oxlint-disable-next-line no-await-in-loop -- sequencial de propósito (handles nativos)
  for (const c of newestFirst) {
    const stateOut = [0]
    // No Electron o main thread é STA: chamadas síncronas em objetos criados
    // nos workers MTA do koffi dão RPC_E_WRONG_THREAD — tudo via .async.
    // oxlint-disable-next-line no-await-in-loop
    const hr = await callNative(c.sdk.raw['WslcGetContainerState'], c.handle, stateOut)
    const raw = hrOk(hr) ? stateOut[0] : 0
    if (raw === 4) {
      // DELETED (ex.: auto-remove) — sai do registro.
      void releaseLocal(c)
      continue
    }
    const { state, status } = mapNativeState(raw, c.exitCode)
    if (!all && state !== 'running') continue
    result.push({
      id: c.id.slice(0, 12),
      name: c.name,
      image: c.image,
      command: c.command,
      created: formatUnixDate(Math.floor(c.createdAt / 1000)),
      status,
      state,
      ports: c.portsDisplay
    })
  }
  return result
}

/** start / stop / restart / remove sobre o handle nativo. */
export async function nativeContainerAction(action: ContainerAction, id: string): Promise<CommandResult> {
  const c = find(id)
  if (!c) return notFound(id)
  const raw = c.sdk.raw
  logInfo('native', `Ação "${action}" no container ${c.id.slice(0, 12)} (${c.name})`)

  const start = async (): Promise<CommandResult> => {
    c.exitCode = null
    const err: (string | null)[] = [null]
    const hr = await callNative(raw['WslcStartContainer'], c.handle, START_ATTACH, err)
    return hrOk(hr)
      ? { ok: true, code: 0, stdout: '', stderr: '' }
      : failResult('WslcStartContainer', hr, err[0])
  }
  const stop = async (): Promise<CommandResult> => {
    const err: (string | null)[] = [null]
    const hr = await callNative(raw['WslcStopContainer'], c.handle, SIGTERM, STOP_TIMEOUT_S, err)
    return hrOk(hr)
      ? { ok: true, code: 0, stdout: '', stderr: '' }
      : failResult('WslcStopContainer', hr, err[0])
  }

  switch (action) {
    case 'start':
      return start()
    case 'stop':
      return stop()
    case 'restart': {
      const stateOut = [0]
      await callNative(raw['WslcGetContainerState'], c.handle, stateOut)
      if (stateOut[0] === 2) {
        const stopped = await stop()
        if (!stopped.ok) return stopped
      }
      return start()
    }
    case 'remove': {
      const err: (string | null)[] = [null]
      const hr = await callNative(raw['WslcDeleteContainer'], c.handle, DELETE_FORCE, err)
      if (!hrOk(hr)) return failResult('WslcDeleteContainer', hr, err[0])
      await releaseLocal(c)
      return { ok: true, code: 0, stdout: '', stderr: '' }
    }
  }
}

/** Sinais que o WslcSignal do SDK conhece (o resto dá E_INVALIDARG). */
const NATIVE_SIGNALS: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGTERM: 15
}

/**
 * Kill nativo: WslcStopContainer com timeout 0 (sinal imediato, sem espera
 * graciosa). Sem sinal = SIGKILL, como o `container kill` da CLI.
 */
export async function killNativeContainer(id: string, signal?: string): Promise<CommandResult> {
  const c = find(id)
  if (!c) return notFound(id)
  const name = (signal?.trim() || 'SIGKILL').toUpperCase()
  const normalized = name.startsWith('SIG') ? name : `SIG${name}`
  const value = /^\d+$/.test(name) ? Number(name) : NATIVE_SIGNALS[normalized]
  if (value === undefined) {
    return {
      ok: false,
      code: 1,
      stdout: '',
      stderr: `Sinal "${signal}" não suportado pelo SDK nativo (aceitos: ${Object.keys(NATIVE_SIGNALS).join(', ')} ou número).`
    }
  }
  logInfo('native', `Kill (${normalized}) no container ${c.id.slice(0, 12)} (${c.name})`)
  const err: (string | null)[] = [null]
  const hr = await callNative(c.sdk.raw['WslcStopContainer'], c.handle, value, 0, err)
  return hrOk(hr)
    ? { ok: true, code: 0, stdout: '', stderr: '' }
    : failResult('WslcStopContainer', hr, err[0])
}

/** Remove todos os containers parados (equivalente ao prune da CLI). */
export async function pruneNativeContainers(): Promise<CommandResult> {
  let removed = 0
  // Remover a entrada corrente durante a iteração de um Map é seguro.
  // oxlint-disable no-await-in-loop -- sequencial de propósito (handles nativos)
  for (const c of registry.values()) {
    const stateOut = [0]
    const hr = await callNative(c.sdk.raw['WslcGetContainerState'], c.handle, stateOut)
    if (!hrOk(hr) || stateOut[0] === 2) continue
    const res = await nativeContainerAction('remove', c.id)
    if (res.ok) removed++
  }
  // oxlint-enable no-await-in-loop
  return { ok: true, code: 0, stdout: `${removed} container(s) removido(s)`, stderr: '' }
}

/** Executa um comando one-shot no container (WslcCreateContainerProcess + callbacks). */
export async function execNativeContainer(id: string, command: string): Promise<CommandResult> {
  const c = find(id)
  if (!c) return notFound(id)
  const { sdk } = c
  const keep = new Keep()
  const callbackIds: bigint[] = []
  try {
    let stdout = ''
    let stderr = ''
    let settleExit!: (code: number) => void
    const exited = new Promise<number>((resolve) => {
      settleExit = resolve
    })

    const ps = keep.hold(sdk.alloc(sdk.types['ProcessSettings'] as AllocType, 1))
    check('WslcInitProcessSettings', sdk.raw['WslcInitProcessSettings'](ps))
    const argv = ['sh', '-c', command]
    check(
      'WslcSetProcessSettingsCmdLine',
      sdk.raw['WslcSetProcessSettingsCmdLine'](ps, keep.strArray(argv), argv.length)
    )
    const onIo = registerCallback((io: number, data: unknown, bytes: number) => {
      const chunk = decodeBytes(data, bytes).toString('utf8')
      if (!chunk) return
      if (io === 1) stdout += chunk
      else stderr += chunk
    }, sdk.types['StdIOCallback'])
    const onExit = registerCallback((code: number) => settleExit(code), sdk.types['ProcessExitCallback'])
    callbackIds.push(onIo, onExit)
    const cbStruct = keep.struct(sdk.types['ProcessCallbacks'], { onStdOut: onIo, onStdErr: onIo, onExit })
    check('WslcSetProcessSettingsCallbacks', sdk.raw['WslcSetProcessSettingsCallbacks'](ps, cbStruct, null))

    const procOut: unknown[] = [null]
    const errOut: (string | null)[] = [null]
    const hr = await callNative(sdk.raw['WslcCreateContainerProcess'], c.handle, ps, procOut, errOut)
    if (!hrOk(hr) || !procOut[0]) {
      for (const cb of callbackIds) unregisterCallback(cb)
      return failResult('WslcCreateContainerProcess', hr, errOut[0])
    }
    const proc = procOut[0]

    let watchdog: NodeJS.Timeout | undefined
    const code = await Promise.race([
      exited,
      new Promise<number>((resolve) => {
        watchdog = setTimeout(() => {
          sdk.raw['WslcSignalProcess'](proc, SIGKILL)
          resolve(-1)
        }, EXEC_TIMEOUT_MS)
        // Não segura o event loop (o timer morre com o exit normal).
        watchdog.unref()
      })
    ])
    if (watchdog) clearTimeout(watchdog)

    // Release assíncrono pelo mesmo motivo do releaseLocal (callback pendente).
    void callNative(sdk.raw['WslcReleaseProcess'], proc)
      .catch(() => 0)
      .then(() => {
        for (const cb of callbackIds) {
          try {
            unregisterCallback(cb)
          } catch {
            // já removido
          }
        }
      })
    logInfo('native', `Exec em ${c.id.slice(0, 12)} saiu com código ${code}`, `cmd: ${command}`)
    return { ok: code === 0, code, stdout, stderr }
  } catch (e) {
    for (const cb of callbackIds) {
      try {
        unregisterCallback(cb)
      } catch {
        // já removido
      }
    }
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}

/** JSON de inspeção do container (WslcInspectContainer, CoTaskMem decodificada pelo koffi). */
export async function inspectNativeContainer(id: string): Promise<CommandResult> {
  const c = find(id)
  if (!c) return notFound(id)
  const out: (string | null)[] = [null]
  const hr = await callNative(c.sdk.raw['WslcInspectContainer'], c.handle, out)
  if (!hrOk(hr)) return failResult('WslcInspectContainer', hr, null)
  return { ok: true, code: 0, stdout: out[0] ?? '', stderr: '' }
}

/**
 * Stream de logs do container: despeja o buffer capturado pelos callbacks do
 * init process e segue ao vivo até o exit (ou até o stopStream do usuário).
 */
export function streamNativeLogs(id: string, sink: StreamSink): number {
  const streamId = allocStreamId()
  const c = find(id)
  if (!c) {
    setTimeout(() => {
      sink.data({ id: streamId, chunk: notFound(id).stderr })
      sink.exit({ id: streamId, code: -1 })
    }, 50)
    return streamId
  }

  const onChunk = (chunk: string): void => sink.data({ id: streamId, chunk })
  const onExit = (code: number | null): void => {
    unsubscribe()
    sink.exit({ id: streamId, code })
    releaseStream(streamId)
  }
  const unsubscribe = (): void => {
    c.logListeners.delete(onChunk)
    c.exitListeners.delete(onExit)
  }

  registerStream(streamId, { kill: unsubscribe })
  // O despejo inicial espera o renderer registrar o id do stream (o invoke
  // precisa resolver antes dos primeiros eventos chegarem).
  setTimeout(() => {
    if (c.logs) sink.data({ id: streamId, chunk: c.logs })
    if (c.exitCode !== null) {
      onExit(c.exitCode)
      return
    }
    c.logListeners.add(onChunk)
    c.exitListeners.add(onExit)
  }, 100)
  return streamId
}

/** Remove (FORCE) todos os containers do app — chamado ao fechar (sem isso viram órfãos). */
export async function cleanupNativeContainers(): Promise<void> {
  const all = [...registry.values()]
  if (all.length === 0) return
  logInfo('native', `Removendo ${all.length} container(s) nativo(s) no fechamento do app`)
  let cap: NodeJS.Timeout | undefined
  await Promise.race([
    Promise.allSettled(
      all.map(async (c) => {
        await callNative(c.sdk.raw['WslcDeleteContainer'], c.handle, DELETE_FORCE, [null])
        await releaseLocal(c)
      })
    ),
    new Promise((resolve) => {
      cap = setTimeout(resolve, 15_000)
      cap.unref()
    })
  ])
  if (cap) clearTimeout(cap)
}

/**
 * Reset de fábrica da sessão nativa: termina a sessão e apaga o storage
 * (containers, registros órfãos E imagens da sessão nativa).
 */
export async function resetNativeSession(): Promise<CommandResult> {
  try {
    logWarn('native', 'Reset da sessão nativa solicitado (terminate + wipe do storage)')
    await Promise.allSettled(Array.from(registry.values()).map((c) => releaseLocal(c)))
    await terminateNativeSession()
    const storage = sessionStoragePath()
    rmSync(storage, { recursive: true, force: true })
    mkdirSync(storage, { recursive: true })
    return {
      ok: true,
      code: 0,
      stdout: 'Sessão nativa resetada — containers, registros e imagens da sessão foram apagados.',
      stderr: ''
    }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Reinicia a sessão nativa aplicando o tuning atual (setNativeSessionTuning):
 * solta os containers, termina e recria — as IMAGENS ficam no storage.
 */
export async function restartNativeSession(): Promise<CommandResult> {
  try {
    logInfo('native', 'Reinício da sessão nativa solicitado (terminate + create com tuning)')
    await Promise.allSettled(Array.from(registry.values()).map((c) => releaseLocal(c)))
    await terminateNativeSession()
    await ensureNativeSession()
    return {
      ok: true,
      code: 0,
      stdout: 'Sessão nativa reiniciada com as novas configurações (as imagens foram mantidas).',
      stderr: ''
    }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}

/** Quantos containers nativos o app está gerenciando (para testes/telemetria). */
export function nativeContainerCount(): number {
  return registry.size
}

/** Acesso ao handle de um container do registro (terminal embutido, Fase 3). */
export function findNativeContainer(
  query: string
): { sdk: WslcSdk; handle: unknown; id: string; name: string } | undefined {
  const c = find(query)
  return c ? { sdk: c.sdk, handle: c.handle, id: c.id, name: c.name } : undefined
}
