import type { BrowserWindow } from 'electron'
import type {
  CommandResult,
  ContainerAction,
  ContainerInfo,
  ImageInfo,
  InstallProgressEvent,
  NativeCrashDumpEvent,
  NativeSessionEndedEvent,
  NativeStatus,
  NativeTuning,
  RegistryImage,
  RunContainerOptions,
  VhdVolumeOptions,
  VolumeInfo
} from '@shared/schemas'
import { createMockOps } from './mock-ops'
import { createRealOps } from './real-ops'
import type { StreamSink } from './streams'
import type { TerminalSink } from './terminals'

/**
 * Fronteiras injetáveis do processo main.
 *
 * O app já trocava a CLI por um dublê (`WslcService` / `mock.ts`), mas três
 * superfícies continuavam presas ao mundo real: o motor NATIVO (FFI na
 * wslcsdk.dll), os STREAMS da CLI (spawn do wslc.exe) e os EFEITOS externos
 * (diálogos do Electron, shell do Windows, busca no Docker Hub).
 *
 * Isso deixava metade do app fora de alcance de teste — inclusive o motor
 * nativo inteiro. Aqui elas viram interface, com implementação real
 * (`real-ops.ts`) e de demonstração (`mock-ops.ts`), resolvida por
 * WSLC_UI_MOCK exatamente como o serviço da CLI.
 */

/** Operações do motor nativo (wslcsdk.dll via FFI) usadas pela camada IPC. */
export interface NativeOps {
  // — sessão —
  ensureSession(): Promise<void>
  isSessionActive(): boolean
  releaseSession(): void
  resetSession(): Promise<CommandResult>
  restartSession(): Promise<CommandResult>
  cleanupContainers(): Promise<void>
  setTuning(tuning: NativeTuning): void
  setOnSessionEnded(cb: (reason: NativeSessionEndedEvent['reason']) => void): void
  setOnCrashDump(cb: (ev: NativeCrashDumpEvent) => void): void
  /** Sonda a DLL: presença, versão e componentes faltando (não exige sessão). */
  status(): NativeStatus
  /** Instalação guiada dos componentes (só precisa da DLL, não da sessão). */
  install(onProgress: (ev: InstallProgressEvent) => void): Promise<CommandResult>

  // — containers —
  listContainers(all: boolean): Promise<ContainerInfo[]>
  containerAction(action: ContainerAction, id: string): Promise<CommandResult>
  pruneContainers(): Promise<CommandResult>
  runContainer(opts: RunContainerOptions): Promise<CommandResult>
  exec(id: string, command: string): Promise<CommandResult>
  inspectContainer(id: string): Promise<CommandResult>
  killContainer(id: string, signal?: string): Promise<CommandResult>
  streamLogs(id: string, sink: StreamSink): number
  openTerminal(id: string, sink: TerminalSink): Promise<number>

  // — imagens —
  listImages(): Promise<ImageInfo[]>
  removeImage(ref: string): Promise<CommandResult>
  tagImage(source: string, target: string): Promise<CommandResult>
  pullImage(ref: string, sink: StreamSink): number
  pushImage(ref: string, sink: StreamSink): number
  loadImage(path: string, sink: StreamSink): number
  importImage(path: string, ref: string, sink: StreamSink): number
  login(server: string, username: string, password: string): Promise<CommandResult>
  logout(server: string): CommandResult

  // — volumes —
  listVolumes(): Promise<VolumeInfo[]>
  createVolume(name: string, opts: VhdVolumeOptions): Promise<CommandResult>
  deleteVolume(name: string): Promise<CommandResult>
  inspectVolume(name: string): Promise<CommandResult>
}

/** Operações de longa duração do motor CLI (spawn do wslc.exe com pipes). */
export interface StreamOps {
  logs(id: string, sink: StreamSink): number
  pull(ref: string, sink: StreamSink): number
  push(ref: string, sink: StreamSink): number
  load(path: string, sink: StreamSink): number
  import(path: string, ref: string, sink: StreamSink): number
  build(args: string[], sink: StreamSink): number
  openTerminal(id: string, sink: TerminalSink): number
}

/** Efeitos fora do app: diálogos nativos, shell do Windows e rede. */
export interface HostOps {
  /** Console do Windows com `wslc exec -it <id> sh`. */
  openExternalTerminal(id: string): void
  /** `wslc settings` (abre o settings.yaml no editor padrão). */
  openWslcSettings(): void
  openExternal(url: string): void
  openPath(path: string): void
  showItemInFolder(path: string): void
  pickDirectory(win: BrowserWindow | null): Promise<string | null>
  pickFile(win: BrowserWindow | null, title: string, extensions: string[]): Promise<string | null>
  pickSave(
    win: BrowserWindow | null,
    title: string,
    defaultName: string,
    extensions: string[]
  ): Promise<string | null>
  searchRegistry(query: string): Promise<RegistryImage[]>
}

export interface Ops {
  native: NativeOps
  stream: StreamOps
  host: HostOps
}

/** WSLC_UI_MOCK=1 (demo) ou =setup (ambiente incompleto) usam os dublês. */
export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env['WSLC_UI_MOCK']
  return mode === '1' || mode === 'setup'
}

let cached: Ops | null = null

/**
 * Fronteiras do processo. Resolvidas uma vez por processo — o motor pode
 * mudar em tempo de execução (CLI ↔ nativo), mas real/dublê não.
 */
export function ops(): Ops {
  cached ??= isMockMode() ? createMockOps() : createRealOps()
  return cached
}

/** Reinjeta as fronteiras (testes). */
export function setOps(next: Ops | null): void {
  cached = next
}
