import type {
  BuildImageOptions,
  CommandResult,
  ConnectNetworkOptions,
  ContainerAction,
  ContainerActionOptions,
  ContainerCopyOptions,
  ContainerInfo,
  ContainerLogsOptions,
  ContainerStats,
  CreateNetworkOptions,
  Engine,
  EngineStatus,
  ExecOptions,
  ImageInfo,
  InstallProgressEvent,
  LogEntry,
  NativeCrashDumpEvent,
  NativeSessionEndedEvent,
  NativeStatus,
  NativeTuning,
  NetworkInfo,
  RegistryImage,
  RemoveImageOptions,
  RunContainerOptions,
  SdkProbe,
  StreamDataEvent,
  StreamExitEvent,
  StreamProgressEvent,
  TerminalDataEvent,
  TerminalExitEvent,
  UpdateStatus,
  VhdVolumeOptions,
  VolumeInfo,
  WindowStateEvent,
  WslcEnvironment,
  WslcSessionInfo
} from '../schemas'

/** Superfície exposta pelo preload em `window.wslcApi`. */
export interface WslcApi {
  getEnvironment(): Promise<WslcEnvironment>
  listContainers(all: boolean): Promise<ContainerInfo[]>
  listImages(): Promise<ImageInfo[]>
  /** `opts` traz sinal/espera do stop e forçar/volumes do remove. */
  containerAction(action: ContainerAction, id: string, opts?: ContainerActionOptions): Promise<CommandResult>
  pruneContainers(): Promise<CommandResult>
  runContainer(opts: RunContainerOptions): Promise<CommandResult>
  /** No motor nativo só o diretório de trabalho e as variáveis têm efeito. */
  execInContainer(id: string, command: string, opts?: ExecOptions): Promise<CommandResult>
  getStats(): Promise<ContainerStats[]>
  inspectContainer(id: string): Promise<CommandResult>
  /** Abre uma janela de terminal do Windows com shell interativo no container. */
  openContainerTerminal(id: string): Promise<void>
  /** Encerra o container com sinal imediato (padrão SIGKILL). */
  killContainer(id: string, signal?: string): Promise<CommandResult>
  /** Exporta o filesystem do container como tarball (CLI `container export`). */
  exportContainer(id: string, path: string): Promise<CommandResult>
  /** Copia arquivos host ↔ container (`container cp`; não existe no SDK). */
  copyToContainer(opts: ContainerCopyOptions): Promise<CommandResult>
  /** `opts.force` remove mesmo em uso; `noPrune` mantém as camadas pai. */
  removeImage(ref: string, opts?: RemoveImageOptions): Promise<CommandResult>
  pruneImages(): Promise<CommandResult>
  inspectImage(ref: string): Promise<CommandResult>
  tagImage(source: string, target: string): Promise<CommandResult>
  pushImage(ref: string): Promise<number>
  buildImage(opts: BuildImageOptions): Promise<number>
  /** Exporta a imagem para um tarball OCI (CLI `image save`). */
  saveImage(ref: string, path: string): Promise<CommandResult>
  /** Carrega um tarball salvo por `image save` (repõe repositório e tag). */
  loadImageTarball(path: string): Promise<number>
  /** Importa um tarball de sistema de arquivos como uma imagem nova. */
  importImageTarball(path: string, ref: string): Promise<number>
  /** Busca imagens no Docker Hub (feita pelo processo main). */
  searchRegistry(query: string): Promise<RegistryImage[]>
  /** Login em registry: valida as credenciais e as guarda para push/pull. Server vazio = Docker Hub. */
  registryLogin(server: string, username: string, password: string): Promise<CommandResult>
  /** Logout: descarta as credenciais guardadas. Server vazio = registry padrão. */
  registryLogout(server: string): Promise<CommandResult>
  listVolumes(): Promise<VolumeInfo[]>
  /** `vhd` cria um volume VHDX; `labels` só valem no motor CLI (-l). */
  createVolume(name: string, vhd?: VhdVolumeOptions, labels?: string[]): Promise<CommandResult>
  /** `force` é o -f da CLI: não erra se o volume já não existir. */
  removeVolume(name: string, force?: boolean): Promise<CommandResult>
  pruneVolumes(): Promise<CommandResult>
  /** JSON de inspeção do volume (nativo: metadados do arquivo .vhdx). */
  inspectVolume(name: string): Promise<CommandResult>
  /** Redes da CLI (o SDK nativo não expõe redes). */
  listNetworks(): Promise<NetworkInfo[]>
  createNetwork(opts: CreateNetworkOptions): Promise<CommandResult>
  /** `force` é o -f da CLI: não erra se a rede já não existir. */
  removeNetwork(name: string, force?: boolean): Promise<CommandResult>
  /** Remove redes sem containers conectados (sem confirmação da CLI!). */
  pruneNetworks(): Promise<CommandResult>
  inspectNetwork(name: string): Promise<CommandResult>
  connectNetwork(opts: ConnectNetworkOptions): Promise<CommandResult>
  disconnectNetwork(network: string, container: string): Promise<CommandResult>
  terminateSession(): Promise<CommandResult>
  /** Sessões wslc ativas (`system session list`). */
  listWslcSessions(): Promise<WslcSessionInfo[]>
  /** Abre o settings.yaml do wslc no editor padrão (cria na 1ª vez). */
  openWslcSettings(): Promise<void>
  /** `wslc settings reset`: volta as configurações aos padrões. */
  resetWslcSettings(): Promise<CommandResult>
  /** Tuning da sessão nativa (CPU/memória/VHD/GPU) — persiste no settings.json. */
  getNativeTuning(): Promise<NativeTuning>
  setNativeTuning(tuning: NativeTuning): Promise<void>
  /** Termina e recria a sessão nativa aplicando o tuning (mantém imagens). */
  restartNativeSession(): Promise<CommandResult>
  /** Caminho da wslcsdk.dll escolhida (null = a empacotada com o app). */
  sdkPath(): Promise<string | null>
  /** Abre o diálogo e sonda o arquivo escolhido; null se cancelou. */
  pickSdk(): Promise<SdkProbe | null>
  /** Grava a escolha — vale na próxima abertura do app. */
  setSdkPath(path: string | null): Promise<void>
  /** Estado da API nativa (wslcsdk.dll via FFI). */
  getNativeStatus(): Promise<NativeStatus>
  /** Motor atual (CLI ou nativo) e estado da sessão nativa. */
  getEngine(): Promise<EngineStatus>
  /** Troca o motor; ao ativar o nativo a sessão é criada na hora. */
  setEngine(engine: Engine): Promise<EngineStatus>
  /** Reset de fábrica da sessão nativa (apaga containers, registros e imagens dela). */
  resetNativeSession(): Promise<CommandResult>
  /** A sessão nativa terminou por fora (WSL desligado, crash). */
  onNativeSessionEnded(cb: (ev: NativeSessionEndedEvent) => void): () => void
  /** Um processo Linux gerou crash dump na sessão nativa. */
  onNativeCrashDump(cb: (ev: NativeCrashDumpEvent) => void): () => void
  /** Instalação guiada dos componentes que faltam (VMP/pacote WSL) com progresso. */
  installWslc(): Promise<CommandResult>
  /** Progresso da instalação guiada (por componente). */
  onInstallProgress(cb: (ev: InstallProgressEvent) => void): () => void
  /** Revela um arquivo no Explorer (ex.: o .dmp de um crash). */
  showItemInFolder(path: string): Promise<void>
  pickDirectory(): Promise<string | null>
  /** Diálogo nativo de abrir arquivo (filtrado por extensões, sem o ponto). */
  pickFile(title: string, extensions: string[]): Promise<string | null>
  /** Diálogo nativo de salvar arquivo. */
  pickSaveFile(title: string, defaultName: string, extensions: string[]): Promise<string | null>
  openExternal(url: string): Promise<void>
  /** Estado do auto-updater (não dispara rede). */
  updateStatus(): Promise<UpdateStatus>
  /** Procura atualização agora; resolve com o estado já atualizado. */
  checkForUpdates(): Promise<UpdateStatus>
  /** Fecha o app e aplica a atualização baixada (só no modo instalador). */
  installUpdate(): Promise<void>
  /** Cada transição do updater: checou, achou, baixou, falhou. */
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  /** As opções valem no motor CLI; no nativo o log vem inteiro por callback. */
  streamLogs(id: string, opts?: ContainerLogsOptions): Promise<number>
  pullImage(ref: string): Promise<number>
  stopStream(streamId: number): Promise<void>
  onStreamData(cb: (ev: StreamDataEvent) => void): () => void
  onStreamExit(cb: (ev: StreamExitEvent) => void): () => void
  /** Progresso estruturado por camada (pull nativo). */
  onStreamProgress(cb: (ev: StreamProgressEvent) => void): () => void
  /** Terminal embutido: abre um shell interativo no container e devolve o id. */
  openTerminal(id: string): Promise<number>
  /** Envia uma linha de comando ao shell do terminal embutido. */
  writeTerminal(terminalId: number, line: string): Promise<void>
  closeTerminal(terminalId: number): Promise<void>
  onTerminalData(cb: (ev: TerminalDataEvent) => void): () => void
  onTerminalExit(cb: (ev: TerminalExitEvent) => void): () => void
  /** Sistema de logs do app (processo main). */
  listLogs(): Promise<LogEntry[]>
  clearLogs(): Promise<void>
  openLogsFolder(): Promise<void>
  onLogEntry(cb: (entry: LogEntry) => void): () => void
  /** Controles da janela frameless. */
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  isWindowMaximized(): Promise<boolean>
  closeWindow(): Promise<void>
  onWindowState(cb: (ev: WindowStateEvent) => void): () => void
}
