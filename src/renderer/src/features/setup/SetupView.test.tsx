import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from '@/design'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandResult, InstallProgressEvent, WslcEnvironment } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import SetupView from './SetupView'

const envIncompleto: WslcEnvironment = {
  wslInstalled: true,
  wslVersion: '2.7.12.0',
  wslVersionOk: false,
  wslcAvailable: false,
  wslcVersion: null,
  ready: false
}

const nativeStatus = (available: boolean) => ({
  available,
  dllPath: available ? 'C:\\vendor\\wslcsdk.dll' : null,
  source: available ? ('bundled' as const) : null,
  wslVersion: available ? '2.9.4' : null,
  abi: available ? '2.9.9+' : null,
  sizeBytes: available ? 4_929_888 : null,
  missingComponents: [],
  detail: 'teste'
})

beforeEach(() => {
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'danger').mockImplementation(() => '')
})

describe('SetupView', () => {
  it('mostra o checklist com o estado de cada requisito', () => {
    installWslcApiMock()
    render(<SetupView env={envIncompleto} checking={false} onRetry={() => {}} />)
    expect(screen.getByText('Ambiente ainda não está pronto')).not.toBeNull()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0].getAttribute('data-state')).toBe('ok') // WSL instalado
    expect(items[1].getAttribute('data-state')).toBe('fail') // 2.9.3+
    expect(items[2].getAttribute('data-state')).toBe('fail') // wslc.exe
    expect(screen.getByText('wsl --update --pre-release')).not.toBeNull()
  })

  it('botão de retry chama onRetry e desabilita durante a checagem', () => {
    installWslcApiMock()
    const onRetry = vi.fn()
    const { rerender } = render(<SetupView env={envIncompleto} checking={false} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(<SetupView env={envIncompleto} checking={true} onRetry={onRetry} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('sem o SDK nativo não há instalação guiada', async () => {
    installWslcApiMock({ getNativeStatus: vi.fn(async () => nativeStatus(false)) })
    render(<SetupView env={envIncompleto} checking={false} onRetry={() => {}} />)
    await waitFor(() => expect(screen.queryByText(/Instalar componentes/)).toBeNull())
  })

  it('instala com progresso e chama onRetry no sucesso', async () => {
    let emitProgress!: (ev: InstallProgressEvent) => void
    let settleInstall!: (res: CommandResult) => void
    const api = installWslcApiMock({
      getNativeStatus: vi.fn(async () => nativeStatus(true)),
      onInstallProgress: vi.fn((cb: (ev: InstallProgressEvent) => void) => {
        emitProgress = cb
        return () => {}
      }),
      installWslc: vi.fn(
        () =>
          new Promise<CommandResult>((resolve) => {
            settleInstall = resolve
          })
      )
    })
    const onRetry = vi.fn()
    render(<SetupView env={envIncompleto} checking={false} onRetry={onRetry} />)

    const button = await screen.findByRole('button', { name: /Instalar componentes/ })
    fireEvent.click(button)
    expect(api.installWslc).toHaveBeenCalledTimes(1)
    await screen.findByText('Preparando instalação…')

    // Progresso ao vivo enquanto o invoke não resolve.
    emitProgress({ component: 'Pacote WSL', step: 2, total: 5 })
    await screen.findByText('Pacote WSL, etapa 2 de 5')

    settleInstall({ ok: true, code: 0, stdout: 'Instalação concluída: Pacote WSL.', stderr: '' })
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Instalação concluída: Pacote WSL.')
  })

  it('instalação com erro mostra toast e não chama onRetry', async () => {
    installWslcApiMock({
      getNativeStatus: vi.fn(async () => nativeStatus(true)),
      installWslc: vi.fn(async () => ({ ok: false, code: 1, stdout: '', stderr: 'sem privilégios' }))
    })
    const onRetry = vi.fn()
    render(<SetupView env={envIncompleto} checking={false} onRetry={onRetry} />)

    fireEvent.click(await screen.findByRole('button', { name: /Instalar componentes/ }))
    await waitFor(() => expect(toast.danger).toHaveBeenCalledWith('sem privilégios'))
    expect(onRetry).not.toHaveBeenCalled()
  })
})
