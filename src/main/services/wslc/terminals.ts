import type { TerminalDataEvent, TerminalExitEvent } from '@shared/schemas'

/**
 * Registro dos terminais embutidos abertos. Cada backend (CLI ou nativo)
 * registra um handle com write/close; a camada IPC roteia por id.
 */

export interface TerminalSink {
  data(ev: TerminalDataEvent): void
  exit(ev: TerminalExitEvent): void
}

export interface TerminalHandle {
  /** Envia UMA linha de comando ao shell (o backend acrescenta o \n). */
  write(line: string): Promise<void> | void
  close(): Promise<void> | void
}

let nextTerminalId = 1
const active = new Map<number, TerminalHandle>()

export function allocTerminalId(): number {
  return nextTerminalId++
}

export function registerTerminal(id: number, handle: TerminalHandle): void {
  active.set(id, handle)
}

/** Remove um terminal que terminou naturalmente (o exit já foi emitido). */
export function releaseTerminal(id: number): void {
  active.delete(id)
}

export async function writeTerminal(id: number, line: string): Promise<void> {
  await active.get(id)?.write(line)
}

export async function closeTerminal(id: number): Promise<void> {
  const handle = active.get(id)
  if (!handle) return
  active.delete(id)
  await handle.close()
}

/** Encerra todos os terminais abertos (chamado no fechamento do app). */
export async function closeAllTerminals(): Promise<void> {
  const ids = [...active.keys()]
  await Promise.allSettled(ids.map((id) => closeTerminal(id)))
}

export function activeTerminalCount(): number {
  return active.size
}
