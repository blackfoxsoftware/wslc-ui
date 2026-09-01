import type { NativeCrashDumpEvent } from '@shared/schemas'
import type { RawCrashDump } from './bindings'

/**
 * Mapeamento puro do crash dump nativo (Fase 6). A inscrição no SDK
 * (WslcRegisterSessionCrashDumpCallback) vive junto do ciclo de vida da
 * sessão em `session.ts`; aqui fica só a tradução do payload.
 *
 * Regras por probe (SDK 2.9.4): o callback dispara para qualquer processo
 * NÃO-init do container morto por sinal com core dump — mesmo com
 * `ulimit -c 0` (o core_pattern é um pipe `|/wsl-capture-crash`, que ignora
 * RLIMIT_CORE); o init (PID 1) ignora sinais fatais entregues via kill.
 */

/** Sinais cuja ação default gera core dump (core(5)); o resto vira "sinal N". */
const SIGNAL_NAMES: Record<number, string> = {
  3: 'SIGQUIT',
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  11: 'SIGSEGV',
  24: 'SIGXCPU',
  25: 'SIGXFSZ',
  31: 'SIGSYS'
}

export function signalName(signal: number): string {
  return SIGNAL_NAMES[signal] ?? `sinal ${signal}`
}

/** O SDK entrega o processName com "/" trocado por "!" ("!bin!busybox"). */
export function mapCrashDump(raw: RawCrashDump): NativeCrashDumpEvent {
  return {
    dumpPath: raw.dumpPath ?? '',
    processName: (raw.processName ?? '').replaceAll('!', '/'),
    pid: raw.pid,
    signal: raw.signal,
    signalName: signalName(raw.signal),
    timestamp: Number(raw.timestamp)
  }
}
