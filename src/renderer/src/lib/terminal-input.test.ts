import { describe, expect, it } from 'vitest'
import { handleTerminalInput, initialInputState, type TerminalInputState } from './terminal-input'

function type(state: TerminalInputState, text: string): ReturnType<typeof handleTerminalInput> {
  return handleTerminalInput(state, text)
}

describe('disciplina de linha do terminal', () => {
  it('ecoa caracteres e envia a linha no Enter', () => {
    let r = type(initialInputState(), 'ls')
    expect(r.echo).toBe('ls')
    expect(r.lines).toEqual([])
    r = type(r.state, '\r')
    expect(r.echo).toBe('\r\n')
    expect(r.lines).toEqual(['ls'])
    expect(r.state.buffer).toBe('')
  })

  it('backspace apaga localmente (e não passa do início da linha)', () => {
    let r = type(initialInputState(), 'ab')
    r = type(r.state, '\x7f')
    expect(r.echo).toBe('\b \b')
    expect(r.state.buffer).toBe('a')
    r = type(r.state, '\x7f\x7f\x7f')
    expect(r.state.buffer).toBe('')
    expect(r.echo).toBe('\b \b')
  })

  it('Ctrl+C descarta a linha sem enviar', () => {
    let r = type(initialInputState(), 'rm -rf /')
    r = type(r.state, '\x03')
    expect(r.echo).toBe('^C\r\n')
    expect(r.lines).toEqual([])
    expect(r.state.buffer).toBe('')
  })

  it('Ctrl+L pede limpeza da tela', () => {
    const r = type(initialInputState(), '\x0c')
    expect(r.clear).toBe(true)
  })

  it('paste com várias linhas envia cada uma', () => {
    const r = type(initialInputState(), 'echo a\r\necho b\recho c')
    expect(r.lines).toEqual(['echo a', 'echo b'])
    expect(r.state.buffer).toBe('echo c')
  })

  it('histórico: ↑ recupera, ↓ volta para a linha vazia', () => {
    let r = type(initialInputState(), 'primeiro\r')
    r = type(r.state, 'segundo\r')
    r = type(r.state, '\x1b[A')
    expect(r.state.buffer).toBe('segundo')
    r = type(r.state, '\x1b[A')
    expect(r.state.buffer).toBe('primeiro')
    expect(r.echo.endsWith('primeiro')).toBe(true)
    r = type(r.state, '\x1b[B')
    expect(r.state.buffer).toBe('segundo')
    r = type(r.state, '\x1b[B')
    expect(r.state.buffer).toBe('')
    expect(r.state.historyIndex).toBeNull()
  })

  it('linha do histórico editada e enviada', () => {
    let r = type(initialInputState(), 'echo x\r')
    r = type(r.state, '\x1b[A')
    r = type(r.state, 'y\r')
    expect(r.lines).toEqual(['echo xy'])
  })

  it('setas laterais e sequências desconhecidas são ignoradas', () => {
    const r = type(initialInputState(), 'a\x1b[C\x1b[Db')
    expect(r.state.buffer).toBe('ab')
    expect(r.echo).toBe('ab')
  })

  it('não repete entrada duplicada consecutiva no histórico', () => {
    let r = type(initialInputState(), 'mesmo\r')
    r = type(r.state, 'mesmo\r')
    expect(r.state.history).toEqual(['mesmo'])
  })
})
