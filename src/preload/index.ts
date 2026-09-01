// Antes de TUDO: desliga o JIT do Zod (a CSP do renderer proíbe eval) — ver zod-config.ts.
import './zod-config'
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { WslcApi } from '@shared/ipc/api'
import {
  eventContract,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type InvokeOutput,
  type InvokeRawInput
} from '@shared/ipc/contract'

/** Invoke tipado pelo contrato — canal e payload conferidos em compilação. */
function invoke<C extends InvokeChannel>(channel: C, input: InvokeRawInput<C>): Promise<InvokeOutput<C>> {
  return ipcRenderer.invoke(channel, input)
}

/** Assinatura de eventos main → renderer com payload validado por Zod. */
function subscribe<C extends EventChannel>(channel: C, cb: (payload: EventPayload<C>) => void): () => void {
  const listener = (_e: IpcRendererEvent, raw: unknown): void =>
    cb(eventContract[channel].parse(raw) as EventPayload<C>)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: WslcApi = {
  getEnvironment: () => invoke('env:get', undefined),
  listContainers: (all) => invoke('containers:list', { all }),
  listImages: () => invoke('images:list', undefined),
  containerAction: (action, id) => invoke('containers:action', { action, id }),
  pruneContainers: () => invoke('containers:prune', undefined),
  runContainer: (opts) => invoke('containers:run', opts),
  execInContainer: (id, command) => invoke('containers:exec', { id, command }),
  getStats: () => invoke('containers:stats', undefined),
  inspectContainer: (id) => invoke('containers:inspect', { id }),
  openContainerTerminal: (id) => invoke('containers:open-terminal', { id }),
  killContainer: (id, signal) => invoke('containers:kill', { id, signal }),
  exportContainer: (id, path) => invoke('containers:export', { id, path }),
  removeImage: (ref) => invoke('images:remove', { ref }),
  pruneImages: () => invoke('images:prune', undefined),
  inspectImage: (ref) => invoke('images:inspect', { ref }),
  tagImage: (source, target) => invoke('images:tag', { source, target }),
  pushImage: (ref) => invoke('images:push', { ref }),
  buildImage: (opts) => invoke('images:build', opts),
  saveImage: (ref, path) => invoke('images:save', { ref, path }),
  loadImageTarball: (path) => invoke('images:load', { path }),
  importImageTarball: (path, ref) => invoke('images:import', { path, ref }),
  searchRegistry: (query) => invoke('images:search-registry', { query }),
  registryLogin: (server, username, password) => invoke('registry:login', { server, username, password }),
  registryLogout: (server) => invoke('registry:logout', { server }),
  listVolumes: () => invoke('volumes:list', undefined),
  createVolume: (name, vhd) => invoke('volumes:create', { name, vhd }),
  removeVolume: (name) => invoke('volumes:remove', { name }),
  pruneVolumes: () => invoke('volumes:prune', undefined),
  inspectVolume: (name) => invoke('volumes:inspect', { name }),
  listNetworks: () => invoke('networks:list', undefined),
  createNetwork: (opts) => invoke('networks:create', opts),
  removeNetwork: (name) => invoke('networks:remove', { name }),
  pruneNetworks: () => invoke('networks:prune', undefined),
  inspectNetwork: (name) => invoke('networks:inspect', { name }),
  connectNetwork: (network, container) => invoke('networks:connect', { network, container }),
  disconnectNetwork: (network, container) => invoke('networks:disconnect', { network, container }),
  terminateSession: () => invoke('system:terminate-session', undefined),
  listWslcSessions: () => invoke('system:sessions', undefined),
  openWslcSettings: () => invoke('system:open-wslc-settings', undefined),
  resetWslcSettings: () => invoke('system:reset-wslc-settings', undefined),
  getNativeTuning: () => invoke('system:get-native-tuning', undefined),
  setNativeTuning: (tuning) => invoke('system:set-native-tuning', tuning),
  restartNativeSession: () => invoke('system:restart-native', undefined),
  sdkPath: () => invoke('system:sdk-path', undefined),
  pickSdk: () => invoke('system:pick-sdk', undefined),
  setSdkPath: (path) => invoke('system:set-sdk-path', { path }),
  getNativeStatus: () => invoke('system:native-status', undefined),
  getEngine: () => invoke('system:get-engine', undefined),
  setEngine: (engine) => invoke('system:set-engine', { engine }),
  resetNativeSession: () => invoke('system:reset-native', undefined),
  onNativeSessionEnded: (cb) => subscribe('native:session-ended', cb),
  onNativeCrashDump: (cb) => subscribe('native:crash-dump', cb),
  installWslc: () => invoke('system:install-wslc', undefined),
  onInstallProgress: (cb) => subscribe('setup:install-progress', cb),
  showItemInFolder: (path) => invoke('system:show-item', { path }),
  pickDirectory: () => invoke('system:pick-directory', undefined),
  pickFile: (title, extensions) => invoke('system:pick-file', { title, extensions }),
  pickSaveFile: (title, defaultName, extensions) =>
    invoke('system:pick-save', { title, defaultName, extensions }),
  openExternal: (url) => invoke('system:open-external', { url }),
  streamLogs: (id) => invoke('containers:logs', { id }),
  pullImage: (ref) => invoke('images:pull', { ref }),
  stopStream: (streamId) => invoke('streams:stop', { streamId }),
  onStreamData: (cb) => subscribe('streams:data', cb),
  onStreamExit: (cb) => subscribe('streams:exit', cb),
  onStreamProgress: (cb) => subscribe('streams:progress', cb),
  openTerminal: (id) => invoke('terminal:open', { id }),
  writeTerminal: (terminalId, line) => invoke('terminal:write', { terminalId, line }),
  closeTerminal: (terminalId) => invoke('terminal:close', { terminalId }),
  onTerminalData: (cb) => subscribe('terminal:data', cb),
  onTerminalExit: (cb) => subscribe('terminal:exit', cb),
  listLogs: () => invoke('logs:list', undefined),
  clearLogs: () => invoke('logs:clear', undefined),
  openLogsFolder: () => invoke('logs:open-folder', undefined),
  onLogEntry: (cb) => subscribe('logs:entry', cb),
  minimizeWindow: () => invoke('window:minimize', undefined),
  toggleMaximizeWindow: () => invoke('window:toggle-maximize', undefined),
  isWindowMaximized: () => invoke('window:is-maximized', undefined),
  closeWindow: () => invoke('window:close', undefined),
  onWindowState: (cb) => subscribe('window:state', cb)
}

contextBridge.exposeInMainWorld('wslcApi', api)
