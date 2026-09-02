import type { UpdateStatus } from '@shared/schemas'
import { logInfo } from '../logger'
import { mockUpdateMode, shouldFail, tickMs } from '../wslc/mock-state'
import type { UpdateOps } from '../wslc/ops'
import { applyEvent, initialStatus, type UpdateEvent } from './state'

/**
 * Auto-updater de demonstração.
 *
 * Sem ele o ciclo inteiro (achar, baixar, instalar) só existiria em produção,
 * numa release já publicada — tarde demais para descobrir que a tela está
 * errada. Aqui ele roda em segundos, nos três modos (instalador, portátil e
 * desligado) e com o caminho triste sob demanda:
 *
 *   WSLC_UI_MOCK_UPDATE=portable          o app não se instala sozinho
 *   WSLC_UI_MOCK_FAIL=updates:check       a checagem falha
 *   WSLC_UI_MOCK_FAIL=updates:download    acha a versão, mas o download morre
 *
 * O que ele nunca faz é fechar o app: em teste isso mataria a sessão do
 * Playwright no meio da verificação.
 */

/** Versão fictícia oferecida: a minor seguinte à que está rodando. */
function nextVersion(current: string): string {
  const [major = '0', minor = '0'] = current.split('.')
  return `${major}.${Number.parseInt(minor, 10) + 1}.0`
}

const DEMO_NOTES = [
  '### Adicionado',
  '- Atualização automática a partir das releases do GitHub',
  '',
  '### Corrigido',
  '- Progresso do pull não zerava ao trocar de motor'
].join('\n')

const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, tickMs()))

export function createMockUpdateOps(currentVersion: string): UpdateOps {
  const mode = mockUpdateMode()
  let status = initialStatus(currentVersion, mode)
  let onChange: ((s: UpdateStatus) => void) | null = null

  const emit = (ev: UpdateEvent): void => {
    const next = applyEvent(status, ev)
    if (next === status) return
    status = next
    onChange?.(status)
  }

  /** Download simulado: só no modo instalador, e depois que `check` resolveu. */
  const fakeDownload = (version: string): void => {
    const steps = [25, 60, 90]
    let i = 0
    const timer = setInterval(() => {
      if (shouldFail('updates:download')) {
        clearInterval(timer)
        emit({ type: 'error', message: '(demo) conexão perdida durante o download [falha injetada]' })
        return
      }
      if (i < steps.length) {
        emit({ type: 'progress', percent: steps[i] })
        i++
        return
      }
      clearInterval(timer)
      emit({ type: 'downloaded', version })
    }, tickMs())
    timer.unref?.()
  }

  const check = async (): Promise<UpdateStatus> => {
    if (mode === 'disabled') return status
    if (status.state === 'downloaded') return status
    emit({ type: 'checking' })
    await wait()
    if (shouldFail('updates:check')) {
      emit({ type: 'error', message: '(demo) GitHub respondeu 503 [falha injetada em updates:check]' })
      return status
    }
    const version = nextVersion(currentVersion)
    emit({ type: 'available', version, notes: DEMO_NOTES, at: Date.now() })
    if (mode === 'installer') fakeDownload(version)
    return status
  }

  return {
    status: () => status,
    check,
    install: () => {
      if (mode !== 'installer' || status.state !== 'downloaded') return
      logInfo('update', `(demo) app fechado para instalar a versão ${status.newVersion}`)
    },
    setOnChange: (cb) => {
      onChange = cb
    },
    // De propósito não checa sozinho: um aviso de atualização surgindo no meio
    // de qualquer teste de outra tela seria ruído injetado por nós mesmos.
    start: () => logInfo('update', `(demo) auto-updater pronto (modo ${mode})`)
  }
}
