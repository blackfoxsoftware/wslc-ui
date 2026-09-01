import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogCategory, LogEntry, LogLevel } from '@shared/schemas'

/**
 * Sistema de logs do app (processo main).
 *
 * Cada entrada vai para três lugares: um ring buffer em memória (servido ao
 * renderer por `logs:list`), o assinante de broadcast (evento `logs:entry`
 * ao vivo) e um arquivo em `userData/logs` com rotação simples. A escrita é
 * síncrona de propósito: entradas são pequenas e o arquivo nunca fica com
 * handle aberto — no Windows, renomear (rotação) um arquivo aberto falha.
 * O módulo não importa Electron — os testes rodam em Node puro.
 */

const MAX_ENTRIES = 2000
const MAX_DETAIL_CHARS = 4000
const DEFAULT_ROTATE_BYTES = 1.5 * 1024 * 1024
const LOG_FILE = 'wslc-ui.log'
const OLD_LOG_FILE = 'wslc-ui.old.log'

let nextId = 1
let entries: LogEntry[] = []
let onEntry: ((entry: LogEntry) => void) | null = null

let logsDir: string | null = null
let rotateBytes = DEFAULT_ROTATE_BYTES
let currentBytes = 0

/** Recebe cada nova entrada (a camada IPC usa para o evento `logs:entry`). */
export function setOnLogEntry(cb: ((entry: LogEntry) => void) | null): void {
  onEntry = cb
}

/** Pasta onde os arquivos de log são gravados (null antes do initLogger). */
export function logsDirectory(): string | null {
  return logsDir
}

/** Liga a gravação em arquivo. Antes disso as entradas ficam só em memória. */
export function initLogger(dir: string, options: { rotateBytes?: number } = {}): void {
  rotateBytes = options.rotateBytes ?? DEFAULT_ROTATE_BYTES
  mkdirSync(dir, { recursive: true })
  logsDir = dir
  try {
    currentBytes = statSync(join(dir, LOG_FILE)).size
  } catch {
    currentBytes = 0
  }
  if (currentBytes > rotateBytes) rotateNow()
}

/** Desliga a gravação em arquivo (testes/encerramento). O buffer permanece. */
export function closeLogger(): void {
  logsDir = null
}

function rotateNow(): void {
  if (!logsDir) return
  try {
    rmSync(join(logsDir, OLD_LOG_FILE), { force: true })
    renameSync(join(logsDir, LOG_FILE), join(logsDir, OLD_LOG_FILE))
  } catch {
    // arquivo em uso/inexistente — segue gravando no atual
  }
  currentBytes = 0
}

function formatLine(entry: LogEntry): string {
  const detail = entry.detail ? `\n    ${entry.detail.replaceAll('\n', '\n    ')}` : ''
  return `${new Date(entry.ts).toISOString()} ${entry.level.padEnd(5)} [${entry.category}] ${entry.message}${detail}\n`
}

export function log(level: LogLevel, category: LogCategory, message: string, detail?: string): LogEntry {
  const trimmed = detail?.trim()
  const entry: LogEntry = {
    id: nextId++,
    ts: Date.now(),
    level,
    category,
    message,
    ...(trimmed ? { detail: trimmed.slice(0, MAX_DETAIL_CHARS) } : {})
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)

  if (logsDir) {
    const line = formatLine(entry)
    try {
      appendFileSync(join(logsDir, LOG_FILE), line)
      currentBytes += Buffer.byteLength(line)
      if (currentBytes > rotateBytes) rotateNow()
    } catch {
      // erro de disco não pode derrubar o app por causa de log
    }
  }

  try {
    onEntry?.(entry)
  } catch {
    // um assinante quebrado não pode derrubar quem loga
  }
  return entry
}

export const logDebug = (category: LogCategory, message: string, detail?: string): LogEntry =>
  log('debug', category, message, detail)
export const logInfo = (category: LogCategory, message: string, detail?: string): LogEntry =>
  log('info', category, message, detail)
export const logWarn = (category: LogCategory, message: string, detail?: string): LogEntry =>
  log('warn', category, message, detail)
export const logError = (category: LogCategory, message: string, detail?: string): LogEntry =>
  log('error', category, message, detail)

/** Snapshot do ring buffer (mais antigos primeiro). */
export function getLogEntries(): LogEntry[] {
  return [...entries]
}

/** Limpa o buffer em memória (o arquivo em disco permanece). */
export function clearLogEntries(): void {
  entries = []
}
