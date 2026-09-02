import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { initLogger, logInfo } from './services/logger'
import { shutdownWslc } from './shutdown'
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
  // O app.quit() daqui é o que dá ao electron-updater a chance de aplicar uma
  // atualização já baixada: ele instala no evento 'quit', depois que este
  // encerramento terminou.
  void shutdownWslc().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})
