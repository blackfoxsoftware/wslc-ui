import { describe, expect, it } from 'vitest'
import { confirmDialog, useConfirmStore } from './confirm-store'

describe('useConfirmStore', () => {
  it('ask abre o modal e resolve true quando confirmado', async () => {
    const promise = confirmDialog({ title: 'Remover tudo?', destructive: true })
    expect(useConfirmStore.getState().current?.title).toBe('Remover tudo?')

    useConfirmStore.getState().settle(true)
    await expect(promise).resolves.toBe(true)
    expect(useConfirmStore.getState().current).toBeNull()
  })

  it('resolve false quando cancelado', async () => {
    const promise = confirmDialog({ title: 'Continuar?' })
    useConfirmStore.getState().settle(false)
    await expect(promise).resolves.toBe(false)
  })

  it('settle sem confirmação pendente é inofensivo', () => {
    expect(() => useConfirmStore.getState().settle(true)).not.toThrow()
  })
})
