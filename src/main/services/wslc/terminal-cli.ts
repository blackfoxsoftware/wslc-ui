import { spawn } from 'node:child_process'
import { logInfo, logWarn } from '../logger'
import { decodeOutput, WSLC } from './cli'
import { createStartupFilter } from './terminal-noise'
import { allocTerminalId, registerTerminal, releaseTerminal, type TerminalSink } from './terminals'

/**
 * Terminal embutido no motor CLI: `wslc exec -i <id> sh -i` com pipes.
 * Sem TTY o shell não ecoa o que digitamos — o eco local é feito pelo
 * renderer (disciplina de linha em lib/terminal-input.ts). O prompt e a
 * saída chegam por stdout/stderr normalmente (validado por probe).
 */

/** Núcleo testável: liga um processo com pipes ao sink do terminal. */
export function openPipedTerminal(file: string, args: string[], sink: TerminalSink): number {
  const id = allocTerminalId()
  const child = spawn(file, args, { windowsHide: true })

  // Sem TTY o `sh -i` reclama do job control ao subir; o aviso é filtrado até a
  // primeira linha digitada (ver terminal-noise.ts).
  const noise = createStartupFilter()
  const emit = (chunk: string): void => {
    if (chunk) sink.data({ id, chunk })
  }
  const forward = (chunk: Buffer): void => emit(noise.push(decodeOutput(chunk)))
  child.stdout?.on('data', forward)
  child.stderr?.on('data', forward)
  child.on('error', (err) => {
    releaseTerminal(id)
    logWarn('terminal', `Terminal #${id} falhou ao iniciar`, err.message)
    sink.data({ id, chunk: `Erro: ${err.message}\n` })
    sink.exit({ id, code: -1 })
  })
  child.on('close', (code) => {
    releaseTerminal(id)
    emit(noise.stop())
    sink.exit({ id, code })
  })

  registerTerminal(id, {
    write: (line) => {
      emit(noise.stop())
      child.stdin?.write(`${line}\n`)
    },
    close: () => {
      child.kill()
    }
  })
  return id
}

/** Abre um shell interativo no container via CLI. */
export function openCliTerminal(containerId: string, sink: TerminalSink): number {
  const id = openPipedTerminal(WSLC, ['exec', '-i', containerId, 'sh', '-i'], sink)
  logInfo('terminal', `Terminal #${id} aberto no container ${containerId} (motor CLI)`)
  return id
}
