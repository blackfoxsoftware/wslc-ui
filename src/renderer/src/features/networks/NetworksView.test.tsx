import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NetworkInfo } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import NetworksView from './NetworksView'

const networks: NetworkInfo[] = [
  { id: 'f5287a761725', name: 'backend', driver: 'bridge' },
  { id: 'aa11bb22cc33', name: 'frontend', driver: 'bridge' }
]

const renderView = (): ReturnType<typeof render> => render(<NetworksView />)

describe('NetworksView', () => {
  it('renderiza a tabela a partir de listNetworks', async () => {
    const api = installWslcApiMock({ listNetworks: vi.fn(async () => networks) })
    renderView()
    expect(await screen.findByText('backend')).not.toBeNull()
    expect(screen.getByText('frontend')).not.toBeNull()
    expect(screen.getByText('f5287a761725')).not.toBeNull()
    expect(api.listNetworks).toHaveBeenCalled()
  })

  it('mostra o estado vazio sem redes', async () => {
    installWslcApiMock()
    renderView()
    expect(await screen.findByText(/Nenhuma rede/)).not.toBeNull()
  })

  it('cria uma rede pelo diálogo (nome + --internal)', async () => {
    const api = installWslcApiMock({ listNetworks: vi.fn(async () => []) })
    renderView()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Criar rede/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nome da rede'), 'minha-rede')
    await user.click(within(dialog).getByLabelText('Rede interna'))
    await user.click(within(dialog).getByRole('button', { name: 'Criar rede' }))
    expect(api.createNetwork).toHaveBeenCalledWith({
      name: 'minha-rede',
      subnet: undefined,
      gateway: undefined,
      internal: true,
      labels: []
    })
  })

  it('mostra erro quando a listagem falha', async () => {
    installWslcApiMock({
      listNetworks: vi.fn(async () => {
        throw new Error('rede indisponível')
      })
    })
    renderView()
    expect(await screen.findByText('rede indisponível')).not.toBeNull()
  })
})
