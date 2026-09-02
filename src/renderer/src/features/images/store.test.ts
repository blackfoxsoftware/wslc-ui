import { toast } from '@/design'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageInfo } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import { useImagesStore } from './store'

beforeEach(() => {
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'danger').mockImplementation(() => '')
  vi.spyOn(toast, 'info').mockImplementation(() => '')
})

afterEach(() => {
  vi.restoreAllMocks()
})

const nginx: ImageInfo = {
  repository: 'nginx',
  tag: 'alpine',
  id: '7bc5ba2f958a',
  created: 'há 13 dias',
  size: '62.8MB'
}

describe('useImagesStore', () => {
  it('remove usa a referência repositório:tag e recarrega a lista', async () => {
    const api = installWslcApiMock()

    await useImagesStore.getState().remove(nginx)

    expect(api.removeImage).toHaveBeenCalledWith('nginx:alpine', undefined)
    expect(api.listImages).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Imagem "nginx:alpine" removida.')
  })

  /**
   * Imagem usada por um container só sai com -f. A saída forçada aparece no
   * toast da falha — quem clica já leu o motivo — em vez de virar um segundo
   * item de menu que remove sem avisar.
   */
  it('remove que falha oferece forçar no toast, e o botão repete com -f', async () => {
    const api = installWslcApiMock({
      removeImage: vi.fn(async () => ({
        ok: false,
        code: 1,
        stdout: '',
        stderr: 'ela está em uso pelo contêiner "web"'
      }))
    })

    await useImagesStore.getState().remove(nginx)

    const [, opcoes] = vi.mocked(toast.danger).mock.calls[0]
    expect(opcoes?.actionProps?.children).toBe('Remover mesmo assim')

    opcoes?.actionProps?.onPress?.({} as never)
    await vi.waitFor(() => {
      expect(api.removeImage).toHaveBeenCalledWith('nginx:alpine', { force: true })
      expect(vi.mocked(toast.danger).mock.calls).toHaveLength(2)
    })
    // Já forçado: a segunda falha não volta a oferecer o mesmo botão.
    expect(vi.mocked(toast.danger).mock.calls[1][1]).toBeUndefined()
  })

  it('removeAll força porque a ordem entre imagem base e derivada importa', async () => {
    const api = installWslcApiMock({ listImages: vi.fn(async () => [nginx]) })

    await useImagesStore.getState().removeAll()

    expect(api.removeImage).toHaveBeenCalledWith('nginx:alpine', { force: true })
    expect(toast.success).toHaveBeenCalledWith('1 imagem(ns) removida(s).')
  })
})
