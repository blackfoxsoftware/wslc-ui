import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CommandResult,
  ImageInfo,
  NativeCrashDumpEvent,
  NativeSessionEndedEvent,
  NativeTuning
} from '@shared/schemas'
import { logError, logInfo, logWarn } from '../../logger'
import {
  coTaskMemFree,
  hrHex,
  hrOk,
  Keep,
  loadWslcSdk,
  registerCallback,
  unregisterCallback,
  waitForSingleObject,
  type NativeFn,
  type WslcSdk
} from './bindings'
import { mapCrashDump } from './crash-dumps'
import { mapNativeImage } from './images'
import { locateWslcSdk } from './locate'

/**
 * Sessão nativa gerenciada pelo app (Fase 1 do ROADMAP).
 *
 * Singleton por processo: criada sob demanda na primeira operação nativa,
 * monitorada via termination event (poll leve) e liberada — sem terminar —
 * quando o app fecha ou o motor volta para a CLI (a sessão continua viva no
 * WSL e é reaproveitada pelo nome na próxima vez).
 */

export const NATIVE_SESSION_NAME = 'WslcUi'

type EndReason = NativeSessionEndedEvent['reason']

const WAIT_OBJECT_0 = 0
const TERMINATION_POLL_MS = 5000
const CO_E_NOTINITIALIZED = 0x800401f0

interface ActiveSession {
  sdk: WslcSdk
  handle: unknown
  terminationEvent: unknown
  timer: ReturnType<typeof setInterval> | null
  /** Inscrição de crash dumps (Fase 6) — liberada junto com o handle. */
  crashSub: unknown
  crashCbId: bigint | null
  /** Regra de marshalling: strings e struct opaca vivem enquanto a sessão existir. */
  keep: Keep
  settings: unknown
}

let active: ActiveSession | null = null
let creating: Promise<ActiveSession> | null = null
let onEnded: (reason: EndReason) => void = () => {}
let onCrashDump: (ev: NativeCrashDumpEvent) => void = () => {}
let tuning: NativeTuning = {}

/**
 * Tuning aplicado quando a sessão é (re)criada (WslcSetSessionSettings*) —
 * validado por sonda: cpu/mem/VHD/GPU valem a cada create pós-terminate.
 * Definido pelo IPC a partir do settings.json (este módulo não importa o
 * electron para continuar testável no vitest).
 */
export function setNativeSessionTuning(next: NativeTuning): void {
  tuning = next
}

export function getNativeSessionTuning(): NativeTuning {
  return tuning
}

/** Callback disparado quando a sessão termina por fora (WSL desligado, crash). */
export function setOnNativeSessionEnded(cb: (reason: EndReason) => void): void {
  onEnded = cb
}

/** Callback disparado quando um processo Linux gera crash dump na sessão. */
export function setOnNativeCrashDump(cb: (ev: NativeCrashDumpEvent) => void): void {
  onCrashDump = cb
}

export function sessionStoragePath(env: NodeJS.ProcessEnv = process.env): string {
  const local = env['LOCALAPPDATA'] ?? join(env['USERPROFILE'] ?? 'C:\\', 'AppData', 'Local')
  return join(local, 'wslc-ui', 'native-session')
}

/**
 * Chama uma função nativa no thread pool do koffi (não bloqueia o event loop).
 * Se o worker não estiver no MTA implícito (CO_E_NOTINITIALIZED), refaz a
 * chamada síncrona no main thread, onde o COM já foi inicializado.
 */
export function callNative(fn: NativeFn, ...args: unknown[]): Promise<number> {
  return new Promise((resolve, reject) => {
    fn.async(...args, (err: Error | null, hr: number) => {
      if (err) reject(err)
      else if (hr >>> 0 === CO_E_NOTINITIALIZED) resolve(fn(...args))
      else resolve(hr)
    })
  })
}

function fail(fnName: string, hr: number, message: unknown): never {
  const detail = typeof message === 'string' && message ? ` — ${message}` : ''
  throw new Error(`${fnName} falhou: ${hrHex(hr)}${detail}`)
}

const FEATURE_ENABLE_GPU = 0x4
const VHD_TYPE_DYNAMIC = 0

/**
 * Aplica o tuning nos settings da sessão antes do Create. Nota da sonda: o
 * WslcSetSessionSettingsVhd ignora `name` e exige flags = NONE; e o Timeout
 * do SDK não é exposto — valores baixos TRAVAM o WslcCreateSession.
 */
function applyTuning(sdk: WslcSdk, settings: unknown, keep: Keep): void {
  const checkHr = (fn: string, hr: number): void => {
    if (!hrOk(hr)) fail(fn, hr, null)
  }
  if (tuning.cpuCount) {
    checkHr(
      'WslcSetSessionSettingsCpuCount',
      sdk.raw['WslcSetSessionSettingsCpuCount'](settings, tuning.cpuCount)
    )
  }
  if (tuning.memoryMb) {
    checkHr(
      'WslcSetSessionSettingsMemory',
      sdk.raw['WslcSetSessionSettingsMemory'](settings, tuning.memoryMb)
    )
  }
  if (tuning.vhdSizeMb) {
    const vhd = keep.struct(sdk.types['VhdRequirements'], {
      name: null,
      sizeBytes: tuning.vhdSizeMb * 1024 * 1024,
      type: VHD_TYPE_DYNAMIC,
      flags: 0,
      uid: 0,
      gid: 0
    })
    checkHr('WslcSetSessionSettingsVhd', sdk.raw['WslcSetSessionSettingsVhd'](settings, vhd))
  }
  if (tuning.gpu) {
    checkHr(
      'WslcSetSessionSettingsFeatureFlags',
      sdk.raw['WslcSetSessionSettingsFeatureFlags'](settings, FEATURE_ENABLE_GPU)
    )
  }
}

function watchTermination(session: ActiveSession): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    if (!session.terminationEvent || active !== session) return
    if (waitForSingleObject(session.terminationEvent, 0) !== WAIT_OBJECT_0) return
    // Chamadas ao SDK sempre via .async: no Electron o main thread é STA e
    // objetos criados nos workers MTA dão RPC_E_WRONG_THREAD em chamada síncrona.
    void (async () => {
      const reasonOut = [0]
      const hr = await callNative(
        session.sdk.raw['WslcGetSessionTerminationReason'],
        session.handle,
        reasonOut
      ).catch(() => -1)
      const code = hrOk(hr) ? reasonOut[0] : 0
      const reason: EndReason = code === 1 ? 'shutdown' : code === 2 ? 'crashed' : 'unknown'
      logWarn('native', `Sessão nativa "${NATIVE_SESSION_NAME}" terminou por fora (${reason})`)
      releaseNativeSession()
      onEnded(reason)
    })()
  }, TERMINATION_POLL_MS)
  // Não impede o processo de sair.
  timer.unref()
  return timer
}

async function createSession(): Promise<ActiveSession> {
  const dllPath = locateWslcSdk()
  if (!dllPath) throw new Error('wslcsdk.dll não encontrada — API nativa indisponível nesta máquina.')
  const sdk = loadWslcSdk(dllPath)

  const storage = sessionStoragePath()
  mkdirSync(storage, { recursive: true })

  // Struct opaca em buffer nativo ESTÁVEL + strings persistentes (regras do ROADMAP).
  const keep = new Keep()
  const settings = sdk.alloc(sdk.types['SessionSettings'] as Parameters<WslcSdk['alloc']>[0], 1)
  const hrInit = sdk.raw['WslcInitSessionSettings'](
    keep.wide(NATIVE_SESSION_NAME),
    keep.wide(storage),
    settings
  )
  if (!hrOk(hrInit)) fail('WslcInitSessionSettings', hrInit, null)
  applyTuning(sdk, settings, keep)

  const sessionOut: unknown[] = [null]
  const errOut: (string | null)[] = [null]
  const hrCreate = await callNative(sdk.raw['WslcCreateSession'], settings, sessionOut, errOut)
  if (!hrOk(hrCreate) || !sessionOut[0]) {
    // ERROR_ALREADY_EXISTS: outro PROCESSO está com a sessão aberta (segunda
    // instância do app, testes de integração…) — o SDK não compartilha sessão.
    if (hrCreate >>> 0 === 0x800700b7) {
      throw new Error(
        `A sessão nativa "${NATIVE_SESSION_NAME}" já está aberta por outro processo (outra instância do app ou testes rodando). Feche-o e tente novamente.`
      )
    }
    fail('WslcCreateSession', hrCreate, errOut[0])
  }

  const evtOut: unknown[] = [null]
  const hrEvt = await callNative(sdk.raw['WslcGetSessionTerminationEvent'], sessionOut[0], evtOut)

  const session: ActiveSession = {
    sdk,
    handle: sessionOut[0],
    terminationEvent: hrOk(hrEvt) ? evtOut[0] : null,
    timer: null,
    crashSub: null,
    crashCbId: null,
    keep,
    settings
  }
  await subscribeCrashDumps(session)
  session.timer = watchTermination(session)
  return session
}

/**
 * Inscreve o callback de crash dumps (Fase 6) — best-effort: a sessão vale
 * mesmo sem ele. Dispara para processos NÃO-init mortos por sinal com core
 * dump; o .dmp cai em %LOCALAPPDATA%\temp\wslc-crashes (caminho Windows).
 */
async function subscribeCrashDumps(session: ActiveSession): Promise<void> {
  const { sdk } = session
  let cbId: bigint | null = null
  try {
    const cb = (infoPtr: unknown): void => {
      if (!infoPtr) return
      const ev = mapCrashDump(sdk.decodeCrashDump(infoPtr))
      logWarn('native', `Crash dump: ${ev.processName} (pid ${ev.pid}, ${ev.signalName})`, ev.dumpPath)
      onCrashDump(ev)
    }
    cbId = registerCallback(cb as never, sdk.types['CrashDumpCallback'])
    const subOut: unknown[] = [null]
    const errOut: (string | null)[] = [null]
    const hr = await callNative(
      sdk.raw['WslcRegisterSessionCrashDumpCallback'],
      session.handle,
      cbId,
      null,
      subOut,
      errOut
    )
    if (hrOk(hr) && subOut[0]) {
      session.crashSub = subOut[0]
      session.crashCbId = cbId
      return
    }
    logWarn('native', `Crash dumps indisponíveis: ${hrHex(hr)}`, errOut[0] || undefined)
  } catch (e) {
    logWarn('native', 'Falha ao inscrever crash dumps', e instanceof Error ? e.message : String(e))
  }
  if (cbId !== null) unregisterCallback(cbId)
}

/** Libera a inscrição de crash dumps (assíncrono; unregister com margem). */
function releaseCrashSubscription(session: ActiveSession): void {
  const { crashSub, crashCbId } = session
  session.crashSub = null
  session.crashCbId = null
  const unregister = (): void => {
    if (crashCbId === null) return
    setImmediate(() => {
      try {
        unregisterCallback(crashCbId)
      } catch {
        // já removido
      }
    })
  }
  if (crashSub) {
    void callNative(session.sdk.raw['WslcReleaseCrashDumpSubscription'], crashSub)
      .catch(() => 0)
      .finally(unregister)
  } else {
    unregister()
  }
}

async function ensure(): Promise<ActiveSession> {
  if (active) return active
  const startedAt = Date.now()
  creating ??= createSession().then(
    (session) => {
      active = session
      creating = null
      logInfo('native', `Sessão nativa "${NATIVE_SESSION_NAME}" criada em ${Date.now() - startedAt}ms`)
      return session
    },
    (e: unknown) => {
      creating = null
      logError('native', 'Falha ao criar a sessão nativa', e instanceof Error ? e.message : String(e))
      throw e
    }
  )
  return creating
}

/** Cria (ou reaproveita) a sessão nativa do app. Lança erro com detalhe em pt-BR. */
export async function ensureNativeSession(): Promise<void> {
  await ensure()
}

/** Sessão ativa (cria sob demanda) para os módulos nativos (containers, imagens). */
export async function acquireNativeSession(): Promise<{ sdk: WslcSdk; handle: unknown }> {
  const session = await ensure()
  return { sdk: session.sdk, handle: session.handle }
}

/**
 * Encerra a sessão nativa de verdade (mata containers) e solta o handle.
 * Assíncrono: chamadas síncronas ao SDK deadlockam se houver callback na fila.
 */
export async function terminateNativeSession(): Promise<void> {
  if (!active) return
  const session = active
  active = null
  if (session.timer) clearInterval(session.timer)
  releaseCrashSubscription(session)
  logInfo('native', `Sessão nativa "${NATIVE_SESSION_NAME}" terminada pelo app`)
  await callNative(session.sdk.raw['WslcTerminateSession'], session.handle)
  await callNative(session.sdk.raw['WslcReleaseSession'], session.handle)
}

export function isNativeSessionActive(): boolean {
  return active !== null
}

/** Lista as imagens da sessão nativa (WslcListSessionImages). */
export async function listNativeImages(): Promise<ImageInfo[]> {
  const session = await ensure()
  const imagesOut: unknown[] = [null]
  const countOut = [0]
  const hr = await callNative(session.sdk.raw['WslcListSessionImages'], session.handle, imagesOut, countOut)
  if (!hrOk(hr)) fail('WslcListSessionImages', hr, null)
  const count = countOut[0]
  if (count === 0 || !imagesOut[0]) return []
  try {
    return session.sdk.decodeImages(imagesOut[0], count).map(mapNativeImage)
  } finally {
    coTaskMemFree(imagesOut[0])
  }
}

/** Remove uma imagem da sessão nativa (WslcDeleteSessionImage). */
export async function removeNativeImage(ref: string): Promise<CommandResult> {
  const session = await ensure()
  const refBuf = Buffer.from(`${ref}\0`, 'utf8')
  const errOut: (string | null)[] = [null]
  const hr = await callNative(session.sdk.raw['WslcDeleteSessionImage'], session.handle, refBuf, errOut)
  const ok = hrOk(hr)
  return {
    ok,
    code: ok ? 0 : 1,
    stdout: '',
    stderr: ok ? '' : errOut[0] || `WslcDeleteSessionImage falhou: ${hrHex(hr)}`
  }
}

/**
 * Solta o handle da sessão SEM terminá-la — containers continuam rodando no
 * WSL e a sessão é reaberta pelo nome na próxima operação nativa.
 */
export function releaseNativeSession(): void {
  if (!active) return
  const session = active
  active = null
  if (session.timer) clearInterval(session.timer)
  releaseCrashSubscription(session)
  // Best-effort assíncrono (STA + possíveis callbacks pendentes); na saída do
  // app o encerramento do processo solta o handle de qualquer forma.
  void callNative(session.sdk.raw['WslcReleaseSession'], session.handle).catch(() => 0)
}
