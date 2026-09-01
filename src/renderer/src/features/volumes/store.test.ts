import { toast } from '@/design'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installWslcApiMock } from '../../test/wslc-api'
import { useVolumesStore } from './store'

beforeEach(() => {
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'danger').mockImplementation(() => '')
  vi.spyOn(toast, 'info').mockImplementation(() => '')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useVolumesStore', () => {
  it('create retorna true, recarrega e emite toast de sucesso', async () => {
    const api = installWslcApiMock({
      listVolumes: vi.fn(async () => [
        { name: 'novo', driver: 'local', mountpoint: '/v/novo', scope: 'local' }
      ])
    })
    const ok = await useVolumesStore.getState().create('novo')
    expect(ok).toBe(true)
    expect(api.createVolume).toHaveBeenCalledWith('novo', undefined)
    expect(useVolumesStore.getState().volumes).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Volume "novo" criado.')
  })

  it('create repassa as opções de VHD do motor nativo', async () => {
    const api = installWslcApiMock()
    const vhd = { sizeMb: 256, fixed: true, owner: { uid: 1000, gid: 1000 } }
    await useVolumesStore.getState().create('vhdvol', vhd)
    expect(api.createVolume).toHaveBeenCalledWith('vhdvol', vhd)
  })

  it('create retorna false e emite toast de erro com o stderr', async () => {
    installWslcApiMock({
      createVolume: vi.fn(async () => ({ ok: false, code: 1, stdout: '', stderr: 'volume já existe: x' }))
    })
    const ok = await useVolumesStore.getState().create('x')
    expect(ok).toBe(false)
    expect(toast.danger).toHaveBeenCalledWith('volume já existe: x')
  })

  it('remove e pruneUnused delegam para a API e recarregam', async () => {
    const api = installWslcApiMock()
    await useVolumesStore.getState().remove('velho')
    await useVolumesStore.getState().pruneUnused()
    expect(api.removeVolume).toHaveBeenCalledWith('velho')
    expect(api.pruneVolumes).toHaveBeenCalled()
    expect(api.listVolumes).toHaveBeenCalledTimes(2)
  })

  it('removeAll remove cada volume e resume em um toast', async () => {
    const api = installWslcApiMock({
      listVolumes: vi
        .fn()
        .mockResolvedValueOnce([
          { name: 'a', driver: 'local', mountpoint: '/v/a', scope: 'local' },
          { name: 'b', driver: 'local', mountpoint: '/v/b', scope: 'local' }
        ])
        .mockResolvedValue([])
    })
    await useVolumesStore.getState().removeAll()
    expect(api.removeVolume).toHaveBeenCalledWith('a')
    expect(api.removeVolume).toHaveBeenCalledWith('b')
    expect(toast.success).toHaveBeenCalledWith('2 volume(s) removido(s).')
  })
})
