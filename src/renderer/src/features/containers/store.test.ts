import { toast } from '@/design'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import { useContainersStore } from './store'

beforeEach(() => {
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'danger').mockImplementation(() => '')
  vi.spyOn(toast, 'info').mockImplementation(() => '')
})

afterEach(() => {
  vi.restoreAllMocks()
})

const web: ContainerInfo = {
  id: 'a1b2c3',
  name: 'web',
  image: 'nginx:latest',
  command: 'nginx',
  created: 'agora',
  status: 'Up',
  state: 'running',
  ports: ''
}

const db: ContainerInfo = {
  id: 'f6e5d4',
  name: 'db',
  image: 'postgres:latest',
  command: 'postgres',
  created: 'ontem',
  status: 'Exited (0)',
  state: 'exited',
  ports: ''
}

describe('useContainersStore', () => {
  it('refresh usa o flag showAll e limpa o erro', async () => {
    const api = installWslcApiMock({ listContainers: vi.fn(async () => [web]) })

    await useContainersStore.getState().refresh()
    expect(api.listContainers).toHaveBeenCalledWith(true)
    expect(useContainersStore.getState().containers).toEqual([web])

    useContainersStore.getState().setShowAll(false)
    await useContainersStore.getState().refresh()
    expect(api.listContainers).toHaveBeenLastCalledWith(false)
  })

  it('refresh captura a falha como mensagem de erro', async () => {
    installWslcApiMock({
      listContainers: vi.fn(async () => {
        throw new Error('wslc fora do ar')
      })
    })
    await useContainersStore.getState().refresh()
    expect(useContainersStore.getState().error).toBe('wslc fora do ar')
  })

  it('applyAction com sucesso emite toast semântico e libera o busyId', async () => {
    const api = installWslcApiMock()
    await useContainersStore.getState().applyAction('stop', web)
    expect(api.containerAction).toHaveBeenCalledWith('stop', 'a1b2c3')
    expect(toast.success).toHaveBeenCalledWith('Container "web" parado.')
    expect(useContainersStore.getState().busyId).toBeNull()
  })

  it('applyAction com falha emite toast de erro com o stderr', async () => {
    installWslcApiMock({
      containerAction: vi.fn(async () => ({ ok: false, code: 1, stdout: '', stderr: 'sem permissão' }))
    })
    await useContainersStore.getState().applyAction('stop', web)
    expect(toast.danger).toHaveBeenCalledWith('sem permissão')
    expect(useContainersStore.getState().error).toBeNull()
    expect(useContainersStore.getState().busyId).toBeNull()
  })

  it('removeAll para os que rodam, remove todos e resume em um toast', async () => {
    const api = installWslcApiMock({ listContainers: vi.fn(async () => [web, db]) })
    await useContainersStore.getState().removeAll()
    expect(api.containerAction).toHaveBeenCalledWith('stop', 'a1b2c3')
    expect(api.containerAction).toHaveBeenCalledWith('remove', 'a1b2c3')
    expect(api.containerAction).toHaveBeenCalledWith('remove', 'f6e5d4')
    expect(api.containerAction).not.toHaveBeenCalledWith('stop', 'f6e5d4')
    expect(toast.success).toHaveBeenCalledWith('2 container(s) removido(s).')
  })

  it('removeAll sem containers apenas informa', async () => {
    const api = installWslcApiMock()
    await useContainersStore.getState().removeAll()
    expect(toast.info).toHaveBeenCalledWith('Nenhum container para remover.')
    expect(api.containerAction).not.toHaveBeenCalled()
  })
})
