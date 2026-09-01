import { spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'
import type { StreamDataEvent, StreamExitEvent, StreamProgressEvent } from '@shared/schemas'
import { logDebug, logError, logInfo } from '../logger'
import { decodeOutput } from './cli'

/**
 * Destino dos eventos de um stream. A camada IPC injeta um sink que
 * encaminha para o renderer; testes injetam um sink em memória.
 */
export interface StreamSink {
  data(ev: StreamDataEvent): void
  exit(ev: StreamExitEvent): void
  /** Snapshot de progresso estruturado (pull nativo por camada). */
  progress?(ev: StreamProgressEvent): void
}

/** Qualquer fonte de stream cancelável (processo da CLI ou logs nativos). */
export interface StreamHandle {
  kill(): void
}

let nextStreamId = 1
const active = new Map<number, StreamHandle>()

/** Reserva um id para um stream gerenciado fora deste módulo (ex.: logs nativos). */
export function allocStreamId(): number {
  return nextStreamId++
}

/** Registra a fonte para que stopStream/stopAllStreams a alcancem. */
export function registerStream(id: number, handle: StreamHandle): void {
  active.set(id, handle)
}

/** Remove um stream que terminou naturalmente. */
export function releaseStream(id: number): void {
  active.delete(id)
}

/**
 * Executa um comando de longa duração (logs -f, pull, build) encaminhando
 * stdout/stderr para o sink.
 */
export function startStream(file: string, args: string[], sink: StreamSink): number {
  const id = allocStreamId()
  const child: ChildProcess = spawn(file, args, { windowsHide: true })
  registerStream(id, { kill: () => child.kill() })
  logInfo('stream', `Stream #${id} iniciado: ${basename(file, '.exe')} ${args.join(' ')}`)

  const forward = (chunk: Buffer): void => {
    sink.data({ id, chunk: decodeOutput(chunk) })
  }
  child.stdout?.on('data', forward)
  child.stderr?.on('data', forward)
  child.on('error', (err) => {
    active.delete(id)
    logError('stream', `Stream #${id} falhou ao iniciar`, err.message)
    sink.data({ id, chunk: `Erro: ${err.message}\n` })
    sink.exit({ id, code: -1 })
  })
  child.on('close', (code) => {
    active.delete(id)
    logDebug('stream', `Stream #${id} terminou (código ${code ?? '?'})`)
    sink.exit({ id, code })
  })
  return id
}

export function stopStream(id: number): void {
  const handle = active.get(id)
  if (handle) {
    active.delete(id)
    logDebug('stream', `Stream #${id} interrompido pelo usuário`)
    handle.kill()
  }
}

export function stopAllStreams(): void {
  // Deletar a chave corrente durante a iteração de um Map é seguro.
  for (const id of active.keys()) stopStream(id)
}

export function activeStreamCount(): number {
  return active.size
}
