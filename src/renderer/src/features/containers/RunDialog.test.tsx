import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ImageInfo } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import RunDialog from './RunDialog'

const localImages: ImageInfo[] = [
  { repository: 'nginx', tag: 'latest', id: 'sha256aaa', created: 'ontem', size: '192 MB' },
  { repository: 'alpine', tag: 'latest', id: 'sha256bbb', created: 'hoje', size: '5.6 MB' }
]

function setup(overrides = {}) {
  const api = installWslcApiMock({ listImages: vi.fn(async () => localImages), ...overrides })
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(<RunDialog onClose={onClose} onDone={onDone} />)
  return { api, onClose, onDone }
}

// O gatilho do Select do HeroUI é um <button> rotulado pelo Label do campo.
async function waitForPreselect(): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name: /Imagem/ })
  await waitFor(() => expect(trigger.textContent).toContain('nginx:latest'))
  return trigger
}

describe('RunDialog', () => {
  it('pré-seleciona a primeira imagem local e sugere o nome do container', async () => {
    setup()
    await waitForPreselect()
    expect((screen.getByLabelText('Nome do container') as HTMLInputElement).value).toBe('nginx')
  })

  it('o select agrupa imagens locais, catálogo e a opção de digitar', async () => {
    setup()
    const user = userEvent.setup()
    const trigger = await waitForPreselect()
    await user.click(trigger)

    const texts = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(texts).toContain('alpine:latest') // grupo "Imagens locais"
    expect(texts.some((t) => t?.includes('PostgreSQL · postgres:latest'))).toBe(true) // grupo "Catálogo"
    expect(texts).toContain('Digitar outra imagem…')
  })

  it('imagem do catálogo pré-preenche portas e variáveis conhecidas', async () => {
    setup()
    const user = userEvent.setup()
    const trigger = await waitForPreselect()
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /PostgreSQL/ }))

    // aviso de download + botão muda de rótulo
    expect(screen.getByText(/ainda não está baixada/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Baixar e executar' })).not.toBeNull()

    // sugestões na aba Rede & Ambiente
    await user.click(screen.getByRole('tab', { name: 'Rede & Ambiente' }))
    expect(screen.getAllByDisplayValue('5432')).toHaveLength(2)
    expect(screen.getByDisplayValue('POSTGRES_PASSWORD')).not.toBeNull()
  })

  it('executa com a imagem e o nome escolhidos', async () => {
    const { api, onDone } = setup()
    const user = userEvent.setup()
    const trigger = await waitForPreselect()
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'alpine:latest' }))

    const nameInput = screen.getByLabelText('Nome do container')
    await user.clear(nameInput)
    await user.type(nameInput, 'meu-teste')
    await user.click(screen.getByRole('button', { name: 'Executar' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.runContainer).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'alpine:latest', name: 'meu-teste', detach: true, rm: false })
    )
  })

  it('cria e anexa um volume novo opcional antes de executar', async () => {
    const { api, onDone } = setup()
    const user = userEvent.setup()
    await waitForPreselect()

    await user.click(screen.getByRole('tab', { name: 'Volumes' }))
    await user.type(screen.getByLabelText('Nome do volume novo'), 'dados')
    await user.type(screen.getByLabelText('Destino do volume novo'), '/data')
    await user.click(screen.getByRole('button', { name: 'Executar' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.createVolume).toHaveBeenCalledWith('dados')
    expect(api.runContainer).toHaveBeenCalledWith(expect.objectContaining({ volumes: ['dados:/data'] }))
  })

  it('escolher "Outra imagem" revela o campo e o erro do run aparece no diálogo', async () => {
    const { onDone } = setup({
      runContainer: vi.fn(async () => ({ ok: false, code: 1, stdout: '', stderr: 'imagem não encontrada' }))
    })
    const user = userEvent.setup()
    const trigger = await waitForPreselect()
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Digitar outra imagem…' }))

    await user.type(await screen.findByPlaceholderText('ex.: nginx:latest'), 'busybox')
    await user.click(screen.getByRole('button', { name: 'Executar' }))

    expect(await screen.findByText('imagem não encontrada')).not.toBeNull()
    expect(onDone).not.toHaveBeenCalled()
  })
})
