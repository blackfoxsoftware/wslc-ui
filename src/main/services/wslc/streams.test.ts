import { describe, expect, it, vi } from 'vitest'
import type { StreamDataEvent, StreamExitEvent } from '@shared/schemas'
import { activeStreamCount, startStream, stopStream, type StreamSink } from './streams'

function collectingSink(): StreamSink & { chunks: StreamDataEvent[]; exits: StreamExitEvent[] } {
  const chunks: StreamDataEvent[] = []
  const exits: StreamExitEvent[] = []
  return {
    chunks,
    exits,
    data: (ev) => chunks.push(ev),
    exit: (ev) => exits.push(ev)
  }
}

describe('startStream', () => {
  it('encaminha stdout/stderr e o código de saída para o sink', async () => {
    const sink = collectingSink()
    const id = startStream(process.execPath, ['-e', "console.log('linha1'); console.error('linha2')"], sink)
    expect(id).toBeGreaterThan(0)

    await vi.waitFor(() => expect(sink.exits).toHaveLength(1), { timeout: 10_000 })
    expect(sink.exits[0]).toEqual({ id, code: 0 })
    const all = sink.chunks.map((c) => c.chunk).join('')
    expect(all).toContain('linha1')
    expect(all).toContain('linha2')
    expect(sink.chunks.every((c) => c.id === id)).toBe(true)
    expect(activeStreamCount()).toBe(0)
  })

  it('binário inexistente emite erro e exit -1', async () => {
    const sink = collectingSink()
    const id = startStream('nao-existe-com-certeza.exe', [], sink)

    await vi.waitFor(() => expect(sink.exits.length).toBeGreaterThan(0), { timeout: 10_000 })
    expect(sink.exits[0].id).toBe(id)
    expect(sink.chunks.some((c) => c.chunk.startsWith('Erro:'))).toBe(true)
  })

  it('stopStream mata um processo de longa duração', async () => {
    const sink = collectingSink()
    const id = startStream(
      process.execPath,
      ['-e', "console.log('pronto'); setTimeout(() => {}, 60000)"],
      sink
    )
    expect(activeStreamCount()).toBe(1)

    // espera o processo estar de pé antes de matar (kill antes do spawn é flaky no Windows)
    await vi.waitFor(() => expect(sink.chunks.length).toBeGreaterThan(0), { timeout: 10_000 })
    stopStream(id)
    await vi.waitFor(() => expect(sink.exits).toHaveLength(1), { timeout: 10_000 })
    expect(activeStreamCount()).toBe(0)
  })
})
