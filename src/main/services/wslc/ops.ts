import type { BrowserWindow } from 'electron'
import type {
  CommandResult,
  ContainerAction,
  ContainerActionOptions,
  ContainerInfo,
  ContainerLogsOptions,
  ExecOptions,
  ImageInfo,
  InstallProgressEvent,
  NativeCrashDumpEvent,
  NativeSessionEndedEvent,
  NativeStatus,
  NativeTuning,
  RegistryImage,
  RunContainerOptions,
  SdkProbe,
  UpdateStatus,
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
 * O app já trocava a CLI por um dublê (`WslcService` / `mock.ts`), mas o resto
 * continuava preso ao mundo real: o motor NATIVO (FFI na wslcsdk.dll), os
 * STREAMS da CLI (spawn do wslc.exe), os EFEITOS externos (diálogos do
 * Electron, shell do Windows, busca no Docker Hub) e o AUTO-UPDATER (GitHub
 * Releases, e o fechamento do app para aplicar a versão nova).
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
  /** Sonda a DLL: presença, origem, ABI e componentes faltando (não exige sessão). */
  status(): NativeStatus
  /** Caminho da DLL escolhida na aba Sistema (null = a empacotada com o app). */
  getSdkPath(): string | null
  /** Passa a usar outra DLL. Só vale de fato na próxima abertura do app. */
  setSdkPath(path: string | null): void
  /** Lê versão, ABI e SHA-256 de uma DLL candidata, sem adotá-la. */
  probeSdk(path: string): SdkProbe
  /** Instalação guiada dos componentes (só precisa da DLL, não da sessão). */
  install(onProgress: (ev: InstallProgressEvent) => void): Promise<CommandResult>

  // — containers —
  listContainers(all: boolean): Promise<ContainerInfo[]>
  /** O SDK honra sinal e espera no stop; o remove dele é sempre forçado. */
  containerAction(action: ContainerAction, id: string, opts?: ContainerActionOptions): Promise<CommandResult>
  pruneContainers(): Promise<CommandResult>
  runContainer(opts: RunContainerOptions): Promise<CommandResult>
  /** Das opções do exec, o SDK só tem diretório de trabalho e variáveis. */
  exec(id: string, command: string, opts?: ExecOptions): Promise<CommandResult>
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
  logs(id: string, opts: ContainerLogsOptions | undefined, sink: StreamSink): number
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

/** Auto-updater: rede, disco e o fechamento do app para aplicar a versão nova. */
export interface UpdateOps {
  /** Estado atual. Não fala com a rede. */
  status(): UpdateStatus
  /** Procura atualização agora; resolve com o estado depois da checagem. */
  check(): Promise<UpdateStatus>
  /** Aplica a atualização já baixada (fecha o app). */
  install(): void
  /** Cada transição de estado — a UI acompanha sem ficar perguntando. */
  setOnChange(cb: (status: UpdateStatus) => void): void
  /** Liga a checagem automática (na abertura e periódica). */
  start(): void
}

export interface Ops {
  native: NativeOps
  stream: StreamOps
  host: HostOps
  update: UpdateOps
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
