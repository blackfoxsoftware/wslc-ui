import { describe, expect, it, vi } from 'vitest'
import { installWslcApiMock } from '../../test/wslc-api'
import { useRegistryStore } from './registry-store'

const result = { name: 'redis', description: 'Cache', stars: 12000, official: true }

describe('useRegistryStore', () => {
  it('search preenche os resultados', async () => {
    installWslcApiMock({ searchRegistry: vi.fn(async () => [result]) })
    await useRegistryStore.getState().search('redis')
    expect(useRegistryStore.getState().results).toEqual([result])
    expect(useRegistryStore.getState().searching).toBe(false)
  })

  it('falha vira mensagem de erro', async () => {
    installWslcApiMock({
      searchRegistry: vi.fn(async () => {
        throw new Error('sem internet')
      })
    })
    await useRegistryStore.getState().search('redis')
    expect(useRegistryStore.getState().error).toBe('sem internet')
    expect(useRegistryStore.getState().results).toEqual([])
  })

  it('resposta atrasada de busca antiga é descartada', async () => {
    let resolveOld: ((v: (typeof result)[]) => void) | undefined
    const api = installWslcApiMock({
      searchRegistry: vi.fn(() => new Promise<(typeof result)[]>((resolve) => (resolveOld = resolve)))
    })
    const oldSearch = useRegistryStore.getState().search('red')
    const capturedResolve = resolveOld
    ;(api.searchRegistry as ReturnType<typeof vi.fn>).mockResolvedValue([result])
    await useRegistryStore.getState().search('redis')
    capturedResolve?.([{ ...result, name: 'antigo' }])
    await oldSearch
    expect(useRegistryStore.getState().results).toEqual([result])
  })

  it('clear zera tudo', async () => {
    installWslcApiMock({ searchRegistry: vi.fn(async () => [result]) })
    await useRegistryStore.getState().search('redis')
    useRegistryStore.getState().clear()
    expect(useRegistryStore.getState().results).toEqual([])
    expect(useRegistryStore.getState().lastQuery).toBe('')
  })
})
