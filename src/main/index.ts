import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { initLogger, logInfo } from './services/logger'
import { ops } from './services/wslc/ops'
import { stopAllStreams } from './services/wslc/streams'
import { closeAllTerminals } from './services/wslc/terminals'
import { createMainWindow } from './window'

// Instância única: a sessão nativa "WslcUi" só pode ser aberta por um
// processo por vez (WslcCreateSession devolve ERROR_ALREADY_EXISTS na segunda).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    initLogger(join(app.getPath('userData'), 'logs'))
    logInfo('app', `wslc-ui ${app.getVersion()} iniciado (Electron ${process.versions.electron})`)
    registerIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  logInfo('app', 'Todas as janelas fechadas — encerrando streams, terminais e containers nativos')
  stopAllStreams()
  // O SDK preview não reabre handles de container em outro processo: sem esta
  // limpeza os containers nativos virariam órfãos ingerenciáveis. Remove tudo
  // que o app criou e então solta a sessão (que continua viva no WSL).
  const { native } = ops()
  void closeAllTerminals()
    .catch(() => undefined)
    .then(() => native.cleanupContainers())
    .finally(() => {
      native.releaseSession()
      if (process.platform !== 'darwin') app.quit()
    })
})
