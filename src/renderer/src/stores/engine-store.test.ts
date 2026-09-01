import { toast } from '@/design'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installWslcApiMock } from '../test/wslc-api'
import { useEngineStore } from './engine-store'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('engine-store', () => {
  it('load busca o status do motor', async () => {
    installWslcApiMock({
      getEngine: vi.fn(async () => ({ engine: 'native' as const, sessionActive: true, detail: 'x' }))
    })
    await useEngineStore.getState().load()
    expect(useEngineStore.getState().status).toEqual({
      engine: 'native',
      sessionActive: true,
      detail: 'x'
    })
  })

  it('setEngine aplica o motor pedido e toasta sucesso', async () => {
    const success = vi.spyOn(toast, 'success')
    installWslcApiMock()
    await useEngineStore.getState().setEngine('native')
    expect(useEngineStore.getState().status?.engine).toBe('native')
    expect(useEngineStore.getState().switching).toBe(false)
    expect(success).toHaveBeenCalledWith('Motor alterado para Nativo (wslcsdk).')
  })

  it('quando o main recusa e mantém a CLI, mostra o detail como erro', async () => {
    const error = vi.spyOn(toast, 'danger')
    installWslcApiMock({
      setEngine: vi.fn(async () => ({
        engine: 'cli' as const,
        sessionActive: false,
        detail: 'Falha ao criar a sessão nativa: dll ausente'
      }))
    })
    await useEngineStore.getState().setEngine('native')
    expect(useEngineStore.getState().status?.engine).toBe('cli')
    expect(error).toHaveBeenCalledWith('Falha ao criar a sessão nativa: dll ausente')
  })

  it('não refaz a troca quando o motor já é o pedido', async () => {
    const api = installWslcApiMock()
    useEngineStore.setState({ status: { engine: 'cli', sessionActive: false, detail: '' } })
    await useEngineStore.getState().setEngine('cli')
    expect(api.setEngine).not.toHaveBeenCalled()
  })

  it('erro de IPC vira toast de erro sem quebrar o estado', async () => {
    const error = vi.spyOn(toast, 'danger')
    installWslcApiMock({
      setEngine: vi.fn(async () => {
        throw new Error('ponte caiu')
      })
    })
    await useEngineStore.getState().setEngine('native')
    expect(useEngineStore.getState().switching).toBe(false)
    expect(error).toHaveBeenCalledWith('ponte caiu')
  })
})
