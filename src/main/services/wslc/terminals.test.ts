import { describe, expect, it, vi } from 'vitest'
import {
  activeTerminalCount,
  allocTerminalId,
  closeAllTerminals,
  closeTerminal,
  registerTerminal,
  releaseTerminal,
  writeTerminal
} from './terminals'

describe('registro de terminais', () => {
  it('roteia write/close pelo id e remove do registro', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const id = allocTerminalId()
    registerTerminal(id, { write, close })

    await writeTerminal(id, 'ls -la')
    expect(write).toHaveBeenCalledWith('ls -la')

    await closeTerminal(id)
    expect(close).toHaveBeenCalledOnce()
    // segundo close é inofensivo (já saiu do registro)
    await closeTerminal(id)
    expect(close).toHaveBeenCalledOnce()
  })

  it('write em id desconhecido não explode', async () => {
    await expect(writeTerminal(999_999, 'echo oi')).resolves.toBeUndefined()
  })

  it('closeAllTerminals fecha todos os registrados', async () => {
    const closes = [vi.fn(), vi.fn()]
    for (const close of closes) registerTerminal(allocTerminalId(), { write: () => {}, close })
    await closeAllTerminals()
    for (const close of closes) expect(close).toHaveBeenCalledOnce()
    expect(activeTerminalCount()).toBe(0)
  })

  it('releaseTerminal tira do registro sem chamar close', async () => {
    const close = vi.fn()
    const id = allocTerminalId()
    registerTerminal(id, { write: () => {}, close })
    releaseTerminal(id)
    await closeTerminal(id)
    expect(close).not.toHaveBeenCalled()
  })
})
