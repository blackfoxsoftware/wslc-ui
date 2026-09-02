import { vi } from 'vitest'
import type { WslcApi } from '@shared/ipc/api'
import type { CommandResult, Engine, UpdateStatus, WslcEnvironment } from '@shared/schemas'

const okResult = (): CommandResult => ({ ok: true, code: 0, stdout: '', stderr: '' })

const idleUpdate = (): UpdateStatus => ({
  mode: 'installer',
  state: 'idle',
  currentVersion: '0.0.0-test',
  newVersion: null,
  percent: null,
  releaseNotes: null,
  releaseUrl: null,
  checkedAt: null,
  error: null,
  reason: null
})

const readyEnv: WslcEnvironment = {
  wslInstalled: true,
  wslVersion: '2.9.3.0',
  wslVersionOk: true,
  wslcAvailable: true,
  wslcVersion: 'mock',
  ready: true
}

/**
 * Instala um `window.wslcApi` falso (tudo vi.fn) para testes de componentes.
 * Retorna a API para inspecionar chamadas e sobrescrever retornos.
 */
export function installWslcApiMock(overrides: Partial<WslcApi> = {}): WslcApi {
  const api: WslcApi = {
    getEnvironment: vi.fn(async () => readyEnv),
    listContainers: vi.fn(async () => []),
    listImages: vi.fn(async () => []),
    containerAction: vi.fn(async () => okResult()),
    pruneContainers: vi.fn(async () => okResult()),
    runContainer: vi.fn(async () => okResult()),
    execInContainer: vi.fn(async () => okResult()),
    getStats: vi.fn(async () => []),
    inspectContainer: vi.fn(async () => okResult()),
    openContainerTerminal: vi.fn(async () => undefined),
    killContainer: vi.fn(async () => okResult()),
    exportContainer: vi.fn(async () => okResult()),
    removeImage: vi.fn(async () => okResult()),
    inspectImage: vi.fn(async () => okResult()),
    tagImage: vi.fn(async () => okResult()),
    pushImage: vi.fn(async () => 1),
    buildImage: vi.fn(async () => 1),
    saveImage: vi.fn(async () => okResult()),
    loadImageTarball: vi.fn(async () => 1),
    importImageTarball: vi.fn(async () => 1),
    searchRegistry: vi.fn(async () => []),
    registryLogin: vi.fn(async () => okResult()),
    registryLogout: vi.fn(async () => okResult()),
    pruneImages: vi.fn(async () => okResult()),
    listVolumes: vi.fn(async () => []),
    createVolume: vi.fn(async () => okResult()),
    removeVolume: vi.fn(async () => okResult()),
    pruneVolumes: vi.fn(async () => okResult()),
    inspectVolume: vi.fn(async () => okResult()),
    listNetworks: vi.fn(async () => []),
    createNetwork: vi.fn(async () => okResult()),
    removeNetwork: vi.fn(async () => okResult()),
    pruneNetworks: vi.fn(async () => okResult()),
    inspectNetwork: vi.fn(async () => okResult()),
    connectNetwork: vi.fn(async () => okResult()),
    disconnectNetwork: vi.fn(async () => okResult()),
    terminateSession: vi.fn(async () => okResult()),
    listWslcSessions: vi.fn(async () => []),
    openWslcSettings: vi.fn(async () => undefined),
    resetWslcSettings: vi.fn(async () => okResult()),
    getNativeTuning: vi.fn(async () => ({})),
    setNativeTuning: vi.fn(async () => undefined),
    restartNativeSession: vi.fn(async () => okResult()),
    sdkPath: vi.fn(async () => null),
    pickSdk: vi.fn(async () => null),
    setSdkPath: vi.fn(async () => undefined),
    getNativeStatus: vi.fn(async () => ({
      available: false,
      dllPath: null,
      source: null,
      wslVersion: null,
      abi: null,
      sizeBytes: null,
      missingComponents: [],
      detail: 'mock'
    })),
    getEngine: vi.fn(async () => ({ engine: 'cli' as Engine, sessionActive: false, detail: 'mock' })),
    setEngine: vi.fn(async (engine: Engine) => ({
      engine,
      sessionActive: engine === 'native',
      detail: 'mock'
    })),
    onNativeSessionEnded: vi.fn(() => () => {}),
    onNativeCrashDump: vi.fn(() => () => {}),
    installWslc: vi.fn(async () => okResult()),
    onInstallProgress: vi.fn(() => () => {}),
    showItemInFolder: vi.fn(async () => undefined),
    resetNativeSession: vi.fn(async () => okResult()),
    pickDirectory: vi.fn(async () => null),
    pickFile: vi.fn(async () => null),
    pickSaveFile: vi.fn(async () => null),
    openExternal: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => idleUpdate()),
    checkForUpdates: vi.fn(async () => idleUpdate()),
    installUpdate: vi.fn(async () => undefined),
    onUpdateStatus: vi.fn(() => () => {}),
    streamLogs: vi.fn(async () => 1),
    pullImage: vi.fn(async () => 1),
    stopStream: vi.fn(async () => undefined),
    onStreamData: vi.fn(() => () => {}),
    onStreamExit: vi.fn(() => () => {}),
    onStreamProgress: vi.fn(() => () => {}),
    openTerminal: vi.fn(async () => 1),
    writeTerminal: vi.fn(async () => undefined),
    closeTerminal: vi.fn(async () => undefined),
    onTerminalData: vi.fn(() => () => {}),
    onTerminalExit: vi.fn(() => () => {}),
    listLogs: vi.fn(async () => []),
    clearLogs: vi.fn(async () => undefined),
    openLogsFolder: vi.fn(async () => undefined),
    onLogEntry: vi.fn(() => () => {}),
    minimizeWindow: vi.fn(async () => undefined),
    toggleMaximizeWindow: vi.fn(async () => true),
    isWindowMaximized: vi.fn(async () => false),
    closeWindow: vi.fn(async () => undefined),
    onWindowState: vi.fn(() => () => {}),
    ...overrides
  }
  window.wslcApi = api
  return api
}
