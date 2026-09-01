import { describe, expect, it, vi } from 'vitest'
import { installWslcApiMock } from '../test/wslc-api'
import { useEnvStore } from './env-store'

describe('useEnvStore', () => {
  it('começa em checking=true sem ambiente', () => {
    expect(useEnvStore.getState().env).toBeNull()
    expect(useEnvStore.getState().checking).toBe(true)
  })

  it('refresh carrega o ambiente e desliga o checking', async () => {
    installWslcApiMock()
    await useEnvStore.getState().refresh()
    expect(useEnvStore.getState().env?.ready).toBe(true)
    expect(useEnvStore.getState().checking).toBe(false)
  })

  it('checking desliga mesmo quando a API falha', async () => {
    installWslcApiMock({
      getEnvironment: vi.fn(async () => {
        throw new Error('ipc caiu')
      })
    })
    await expect(useEnvStore.getState().refresh()).rejects.toThrow('ipc caiu')
    expect(useEnvStore.getState().checking).toBe(false)
  })
})
