import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { rendererStreamSink, sendEvent } from './events'

function fakeSender(destroyed = false): WebContents & { send: ReturnType<typeof vi.fn> } {
  return {
    isDestroyed: () => destroyed,
    send: vi.fn()
  } as unknown as WebContents & { send: ReturnType<typeof vi.fn> }
}

describe('sendEvent', () => {
  it('envia payload validado para o renderer', () => {
    const sender = fakeSender()
    sendEvent(sender, 'streams:data', { id: 1, chunk: 'olá' })
    expect(sender.send).toHaveBeenCalledWith('streams:data', { id: 1, chunk: 'olá' })
  })

  it('não envia para WebContents destruído', () => {
    const sender = fakeSender(true)
    sendEvent(sender, 'streams:exit', { id: 1, code: 0 })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('lança se o payload violar o contrato', () => {
    const sender = fakeSender()
    expect(() => sendEvent(sender, 'streams:data', { id: 1.5, chunk: 'x' })).toThrow()
    expect(sender.send).not.toHaveBeenCalled()
  })
})

describe('rendererStreamSink', () => {
  it('encaminha data e exit pelos canais de evento', () => {
    const sender = fakeSender()
    const sink = rendererStreamSink(sender)
    sink.data({ id: 7, chunk: 'log' })
    sink.exit({ id: 7, code: null })
    expect(sender.send).toHaveBeenNthCalledWith(1, 'streams:data', { id: 7, chunk: 'log' })
    expect(sender.send).toHaveBeenNthCalledWith(2, 'streams:exit', { id: 7, code: null })
  })
})
