import { spawn } from 'node:child_process'
import { dialog, shell } from 'electron'
import { searchDockerHub } from '../registry'
import { WSLC } from './cli'
import {
  cleanupNativeContainers,
  execNativeContainer,
  inspectNativeContainer,
  killNativeContainer,
  listNativeContainers,
  nativeContainerAction,
  pruneNativeContainers,
  resetNativeSession,
  restartNativeSession,
  runNativeContainer,
  streamNativeLogs
} from './native/containers'
import {
  importNativeImage,
  loadNativeImage,
  pullNativeImage,
  pushNativeImage,
  tagNativeImage
} from './native/image-ops'
import { installNativeComponents } from './native/install'
import { getCustomSdkPath, setCustomSdkPath } from './native/locate'
import { probeSdkFile } from './native/probe'
import { loginNativeRegistry, logoutNativeRegistry } from './native/registry'
import {
  ensureNativeSession,
  isNativeSessionActive,
  listNativeImages,
  releaseNativeSession,
  removeNativeImage,
  setNativeSessionTuning,
  setOnNativeCrashDump,
  setOnNativeSessionEnded
} from './native/session'
import { getNativeStatus } from './native/status'
import { openNativeTerminal } from './native/terminal'
import {
  createNativeVolume,
  deleteNativeVolume,
  inspectNativeVolume,
  listNativeVolumes
} from './native/volumes'
import { startStream } from './streams'
import { openCliTerminal } from './terminal-cli'
import type { HostOps, NativeOps, Ops, StreamOps } from './ops'

/**
 * Fronteiras reais: FFI na wslcsdk.dll, spawn do wslc.exe e o shell/diálogos
 * do Windows. Só fiação — a lógica continua nos módulos de origem.
 */

const nativeOps: NativeOps = {
  ensureSession: ensureNativeSession,
  isSessionActive: isNativeSessionActive,
  releaseSession: releaseNativeSession,
  resetSession: resetNativeSession,
  restartSession: restartNativeSession,
  cleanupContainers: cleanupNativeContainers,
  setTuning: setNativeSessionTuning,
  setOnSessionEnded: setOnNativeSessionEnded,
  setOnCrashDump: setOnNativeCrashDump,
  status: getNativeStatus,
  getSdkPath: getCustomSdkPath,
  setSdkPath: setCustomSdkPath,
  probeSdk: probeSdkFile,
  install: installNativeComponents,

  listContainers: listNativeContainers,
  containerAction: nativeContainerAction,
  pruneContainers: pruneNativeContainers,
  runContainer: runNativeContainer,
  exec: execNativeContainer,
  inspectContainer: inspectNativeContainer,
  killContainer: killNativeContainer,
  streamLogs: streamNativeLogs,
  openTerminal: openNativeTerminal,

  listImages: listNativeImages,
  removeImage: removeNativeImage,
  tagImage: tagNativeImage,
  pullImage: pullNativeImage,
  pushImage: pushNativeImage,
  loadImage: loadNativeImage,
  importImage: importNativeImage,
  login: loginNativeRegistry,
  logout: logoutNativeRegistry,

  listVolumes: listNativeVolumes,
  createVolume: createNativeVolume,
  deleteVolume: deleteNativeVolume,
  inspectVolume: inspectNativeVolume
}

const streamOps: StreamOps = {
  logs: (id, sink) => startStream(WSLC, ['container', 'logs', '--follow', id], sink),
  pull: (ref, sink) => startStream(WSLC, ['image', 'pull', ref], sink),
  push: (ref, sink) => startStream(WSLC, ['push', ref], sink),
  load: (path, sink) => startStream(WSLC, ['image', 'load', '-i', path], sink),
  import: (path, ref, sink) => startStream(WSLC, ['image', 'import', path, ref], sink),
  build: (args, sink) => startStream(WSLC, args, sink),
  openTerminal: openCliTerminal
}

const hostOps: HostOps = {
  openExternalTerminal: (id) => {
    // Console do Windows com shell interativo no container (sh é universal).
    const child = spawn('cmd.exe', ['/c', 'start', `Container ${id}`, 'wslc.exe', 'exec', '-it', id, 'sh'], {
      detached: true,
      windowsHide: true
    })
    child.unref()
  },
  openWslcSettings: () => {
    // `wslc settings` abre o settings.yaml no editor padrão (cria na 1ª vez);
    // detached para não segurar o processo nem o timeout do execFile.
    const child = spawn(WSLC, ['settings'], { detached: true, windowsHide: true })
    child.unref()
  },
  openExternal: (url) => {
    void shell.openExternal(url)
  },
  openPath: (path) => {
    void shell.openPath(path)
  },
  showItemInFolder: (path) => {
    shell.showItemInFolder(path)
  },
  pickDirectory: async (win) => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: 'Escolher a pasta de contexto do build',
      properties: ['openDirectory']
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  },
  pickFile: async (win, title, extensions) => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title,
      filters: [{ name: extensions.map((e) => `*.${e}`).join(';'), extensions }],
      properties: ['openFile']
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  },
  pickSave: async (win, title, defaultName, extensions) => {
    if (!win) return null
    const res = await dialog.showSaveDialog(win, {
      title,
      defaultPath: defaultName,
      filters: [{ name: extensions.map((e) => `*.${e}`).join(';'), extensions }]
    })
    return res.canceled || !res.filePath ? null : res.filePath
  },
  searchRegistry: (query) => searchDockerHub(query)
}

export function createRealOps(): Ops {
  return { native: nativeOps, stream: streamOps, host: hostOps }
}
