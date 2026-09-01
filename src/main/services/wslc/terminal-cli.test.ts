import { describe, expect, it } from 'vitest'
import type { TerminalDataEvent, TerminalExitEvent } from '@shared/schemas'
import { openPipedTerminal } from './terminal-cli'
import { closeTerminal, writeTerminal } from './terminals'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// oxlint-disable no-await-in-loop -- polling intencional

interface MemorySink {
  chunks: TerminalDataEvent[]
  exits: TerminalExitEvent[]
  data(ev: TerminalDataEvent): void
  exit(ev: TerminalExitEvent): void
}

function memorySink(): MemorySink {
  const sink: MemorySink = {
    chunks: [],
    exits: [],
    data: (ev) => sink.chunks.push(ev),
    exit: (ev) => sink.exits.push(ev)
  }
  return sink
}

// Usa o Node como "shell": ecoa cada linha do stdin com prefixo e sai no "exit".
const ECHO_SCRIPT = `
  const rl = require('node:readline').createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (line === 'exit') process.exit(3)
    process.stdout.write('E:' + line + '\\n')
  })
`

describe('terminal por pipes (backend CLI)', () => {
  it('encaminha linhas ao stdin e a saída ao sink', { timeout: 20_000 }, async () => {
    const sink = memorySink()
    const id = openPipedTerminal(process.execPath, ['-e', ECHO_SCRIPT], sink)
    expect(id).toBeGreaterThan(0)

    await writeTerminal(id, 'olá terminal')
    for (let i = 0; i < 100 && sink.chunks.length === 0; i++) await sleep(50)
    expect(sink.chunks.map((c) => c.chunk).join('')).toContain('E:olá terminal')

    await writeTerminal(id, 'exit')
    for (let i = 0; i < 100 && sink.exits.length === 0; i++) await sleep(50)
    expect(sink.exits[0]?.code).toBe(3)
  })

  it('close mata o processo e emite exit', { timeout: 20_000 }, async () => {
    const sink = memorySink()
    const id = openPipedTerminal(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], sink)
    await sleep(300)
    await closeTerminal(id)
    for (let i = 0; i < 100 && sink.exits.length === 0; i++) await sleep(50)
    expect(sink.exits).toHaveLength(1)
  })

  it('binário inexistente devolve erro pelo sink', { timeout: 20_000 }, async () => {
    const sink = memorySink()
    openPipedTerminal('caminho-que-nao-existe.exe', [], sink)
    for (let i = 0; i < 100 && sink.exits.length === 0; i++) await sleep(50)
    expect(sink.exits[0]?.code).toBe(-1)
    expect(sink.chunks.map((c) => c.chunk).join('')).toContain('Erro:')
  })
})
