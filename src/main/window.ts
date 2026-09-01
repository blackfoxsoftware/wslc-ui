import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { ops } from './services/wslc/ops'
import { sendEvent } from './ipc/events'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#14161d',
    title: 'WSLC UI',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Mantém a topbar do renderer em sincronia com o estado real da janela.
  win.on('maximize', () => sendEvent(win.webContents, 'window:state', { maximized: true }))
  win.on('unmaximize', () => sendEvent(win.webContents, 'window:state', { maximized: false }))

  // Link com target="_blank" (as referências em Sistema) abre no navegador
  // padrão, nunca numa janela do app — pela mesma fronteira do IPC, para o
  // modo demo poder apenas registrar em vez de abrir.
  win.webContents.setWindowOpenHandler((details) => {
    ops().host.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
