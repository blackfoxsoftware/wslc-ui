import { describe, expect, it, vi } from 'vitest'
import type { ContainerInfo, ContainerStats } from '@shared/schemas'
import { installWslcApiMock } from '../test/wslc-api'
import { statsFor, useStatsStore } from './stats-store'

const sample = (cpu: number): ContainerStats => ({
  id: 'a1b2c3',
  name: 'web',
  cpuPercent: cpu,
  memUsage: '100MiB / 4GiB',
  memPercent: 2.5,
  netIO: '0B / 0B',
  blockIO: '0B / 0B'
})

describe('useStatsStore', () => {
  it('refresh indexa por id e acumula histórico', async () => {
    const api = installWslcApiMock({ getStats: vi.fn(async () => [sample(10)]) })
    await useStatsStore.getState().refresh()
    ;(api.getStats as ReturnType<typeof vi.fn>).mockResolvedValue([sample(20)])
    await useStatsStore.getState().refresh()

    const state = useStatsStore.getState()
    expect(state.byId['a1b2c3'].cpuPercent).toBe(20)
    expect(state.history['a1b2c3'].map((s) => s.cpu)).toEqual([10, 20])
  })

  it('containers que sumiram saem do índice e do histórico', async () => {
    installWslcApiMock({ getStats: vi.fn(async () => [sample(10)]) })
    await useStatsStore.getState().refresh()
    installWslcApiMock({ getStats: vi.fn(async () => []) })
    await useStatsStore.getState().refresh()
    expect(useStatsStore.getState().byId).toEqual({})
    expect(useStatsStore.getState().history).toEqual({})
  })

  it('falha do stats é silenciosa (melhor-esforço)', async () => {
    installWslcApiMock({
      getStats: vi.fn(async () => {
        throw new Error('sem stats no preview')
      })
    })
    await expect(useStatsStore.getState().refresh()).resolves.toBeUndefined()
  })
})

describe('statsFor', () => {
  it('busca por id e cai para o nome', () => {
    const byId = { a1b2c3: sample(10) }
    const byIdOnly: ContainerInfo = {
      id: 'a1b2c3',
      name: '',
      image: '',
      command: '',
      created: '',
      status: '',
      state: 'running',
      ports: ''
    }
    expect(statsFor(byId, byIdOnly)?.cpuPercent).toBe(10)
    const byName: ContainerInfo = { ...byIdOnly, id: 'outro-id', name: 'web' }
    expect(statsFor(byId, byName)?.cpuPercent).toBe(10)
  })
})
