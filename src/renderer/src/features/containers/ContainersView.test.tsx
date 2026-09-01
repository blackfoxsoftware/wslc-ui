import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import ContainersView from './ContainersView'

const containers: ContainerInfo[] = [
  {
    id: 'a1b2c3d4e5f6',
    name: 'web',
    image: 'nginx:latest',
    command: 'nginx',
    created: 'há 2 horas',
    status: 'Up 2 hours',
    state: 'running',
    ports: '0.0.0.0:8080->80/tcp'
  },
  {
    id: 'f6e5d4c3b2a1',
    name: 'db',
    image: 'postgres:latest',
    command: 'postgres',
    created: 'ontem',
    status: 'Exited (0)',
    state: 'exited',
    ports: ''
  }
]

const renderView = (): ReturnType<typeof render> => render(<ContainersView />)

describe('ContainersView', () => {
  it('renderiza a tabela a partir de listContainers', async () => {
    const api = installWslcApiMock({ listContainers: vi.fn(async () => containers) })
    renderView()

    expect(await screen.findByText('web')).not.toBeNull()
    expect(screen.getByText('db')).not.toBeNull()
    expect(api.listContainers).toHaveBeenCalledWith(true)
    // running mostra "Parar"; parado mostra "Iniciar" (icon buttons com aria-label)
    expect(screen.getByRole('button', { name: 'Parar' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Iniciar' })).not.toBeNull()
  })

  it('mostra o estado vazio sem containers', async () => {
    installWslcApiMock()
    renderView()
    expect(await screen.findByText(/Nenhum container encontrado/)).not.toBeNull()
  })

  it('mostra erro quando a listagem falha', async () => {
    installWslcApiMock({
      listContainers: vi.fn(async () => {
        throw new Error('wslc indisponível')
      })
    })
    renderView()
    expect(await screen.findByText('wslc indisponível')).not.toBeNull()
  })
})
