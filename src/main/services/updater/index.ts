import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/schemas'
import { logDebug, logError, logInfo, logWarn } from '../logger'
import type { UpdateOps } from '../wslc/ops'
import { applyEvent, detectMode, initialStatus, type UpdateEvent } from './state'

/**
 * Auto-updater real: GitHub Releases via electron-updater.
 *
 * A release publicada pelo workflow leva os dois .exe e o `latest.yml` que o
 * updater consulta. O que ele NÃO faz aqui é decidir sozinho o que mostrar —
 * cada evento passa por `applyEvent` (state.ts), que é onde as regras moram.
 */

/** De quanto em quanto tempo reconsultar o GitHub enquanto o app está aberto. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** A abertura do app tem coisa mais urgente a fazer do que falar com a rede. */
const FIRST_CHECK_DELAY_MS = 15_000

/** `releaseNotes` vem como texto ou como lista de releases pulados. */
function normalizeNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const partes = notes
      .map((n: { version?: string; note?: string | null }) =>
        [n.version ? `## ${n.version}` : '', n.note ?? ''].filter(Boolean).join('\n')
      )
      .filter(Boolean)
    return partes.length > 0 ? partes.join('\n\n') : null
  }
  return null
}

export function createUpdateOps(): UpdateOps {
  const mode = detectMode(app.isPackaged)
  let status = initialStatus(app.getVersion(), mode)
  let onChange: ((s: UpdateStatus) => void) | null = null

  const emit = (ev: UpdateEvent): void => {
    const next = applyEvent(status, ev)
    if (next === status) return
    status = next
    onChange?.(status)
  }

  // O log do updater vai para o log do app: quando uma atualização falha na
  // máquina de alguém, o motivo precisa estar em algum lugar que dê para pedir.
  autoUpdater.logger = {
    info: (m: unknown) => void logInfo('update', String(m)),
    warn: (m: unknown) => void logWarn('update', String(m)),
    error: (m: unknown) => void logError('update', String(m)),
    debug: (m: string) => void logDebug('update', m)
  }
  // Baixar sozinho só faz sentido onde existe um instalador para aplicar.
  autoUpdater.autoDownload = mode === 'installer'
  autoUpdater.autoInstallOnAppQuit = mode === 'installer'
  // Decisão de projeto: pré-lançamento (0.3.0-rc.1) não é atualização. Os rc
  // continuam publicados, para quem quiser baixar na mão.
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => emit({ type: 'checking' }))
  autoUpdater.on('update-not-available', () => emit({ type: 'up-to-date', at: Date.now() }))
  autoUpdater.on('update-available', (info) =>
    emit({
      type: 'available',
      version: info.version,
      notes: normalizeNotes(info.releaseNotes),
      at: Date.now()
    })
  )
  autoUpdater.on('download-progress', (p) => emit({ type: 'progress', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => emit({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', (e: Error) => emit({ type: 'error', message: e.message || String(e) }))

  const check = async (): Promise<UpdateStatus> => {
    if (mode === 'disabled') return status
    // Já baixada: checar de novo só serviria para baixar a mesma coisa outra vez.
    if (status.state === 'downloaded') return status
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // O evento 'error' já registrou o motivo no estado; aqui só evitamos que
      // uma falha de rede vire rejeição não tratada no processo main.
    }
    return status
  }

  return {
    status: () => status,
    check,
    install: () => {
      if (mode !== 'installer' || status.state !== 'downloaded') return
      logInfo('update', `Instalando a versão ${status.newVersion} e reabrindo o app`)
      autoUpdater.quitAndInstall()
    },
    setOnChange: (cb) => {
      onChange = cb
    },
    start: () => {
      if (mode === 'disabled') {
        logInfo('update', `Auto-updater desligado: ${status.reason}`)
        return
      }
      logInfo('update', `Auto-updater ligado (modo ${mode}, versão ${status.currentVersion})`)
      setTimeout(() => void check(), FIRST_CHECK_DELAY_MS).unref()
      setInterval(() => void check(), CHECK_INTERVAL_MS).unref()
    }
  }
}
