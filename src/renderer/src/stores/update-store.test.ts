import { toast } from '@/design'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/schemas'
import { installWslcApiMock } from '../test/wslc-api'
import { useUpdateStore } from './update-store'

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  mode: 'installer',
  state: 'idle',
  currentVersion: '0.2.0',
  newVersion: null,
  percent: null,
  releaseNotes: null,
  releaseUrl: null,
  checkedAt: null,
  error: null,
  reason: null,
  ...over
})

beforeEach(() => {
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'info').mockImplementation(() => '')
  vi.spyOn(toast, 'danger').mockImplementation(() => '')
  useUpdateStore.setState({ status: null, checking: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useUpdateStore', () => {
  it('avisa uma vez quando a atualização fica pronta', () => {
    const { receive } = useUpdateStore.getState()
    receive(status({ state: 'downloading', newVersion: '0.3.0', percent: 40 }))
    expect(toast.success).not.toHaveBeenCalled()

    receive(status({ state: 'downloaded', newVersion: '0.3.0', percent: 100 }))
    expect(toast.success).toHaveBeenCalledWith(
      'Versão 0.3.0 pronta — será instalada quando você fechar o app.',
      expect.anything()
    )
  })

  // O main empurra o status a cada evento, e o download emite muitos: sem a
  // comparação de estado anterior, isso viraria uma cascata de avisos.
  it('progresso não vira uma enxurrada de avisos', () => {
    const { receive } = useUpdateStore.getState()
    for (const percent of [10, 30, 60, 90]) {
      receive(status({ state: 'downloading', newVersion: '0.3.0', percent }))
    }
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().status?.percent).toBe(90)
  })

  it('no portátil o aviso leva para a release, porque não há o que instalar', () => {
    installWslcApiMock()
    useUpdateStore.getState().receive(
      status({
        mode: 'portable',
        state: 'available',
        newVersion: '0.3.0',
        releaseUrl: 'https://github.com/blackfoxsoftware/wslc-ui/releases/tag/v0.3.0'
      })
    )
    expect(toast.info).toHaveBeenCalledWith('Versão 0.3.0 disponível.', expect.anything())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('estar em dia não avisa nada', () => {
    useUpdateStore.getState().receive(status({ state: 'up-to-date', checkedAt: 1 }))
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('checar guarda o resultado e desliga o "procurando"', async () => {
    const api = installWslcApiMock({
      checkForUpdates: vi.fn(async () => status({ state: 'up-to-date', checkedAt: 7 }))
    })
    await useUpdateStore.getState().check()
    expect(api.checkForUpdates).toHaveBeenCalled()
    expect(useUpdateStore.getState().status?.state).toBe('up-to-date')
    expect(useUpdateStore.getState().checking).toBe(false)
  })
})
