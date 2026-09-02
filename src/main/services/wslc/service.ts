import type {
  CommandResult,
  ConnectNetworkOptions,
  ContainerAction,
  ContainerActionOptions,
  ContainerCopyOptions,
  ContainerInfo,
  ContainerStats,
  CreateNetworkOptions,
  ExecOptions,
  ImageInfo,
  NetworkInfo,
  RemoveImageOptions,
  RunContainerOptions,
  VhdVolumeOptions,
  VolumeInfo,
  WslcEnvironment,
  WslcSessionInfo
} from '@shared/schemas'

/**
 * Contrato do serviço wslc — implementado pela versão real (`real.ts`, que
 * encapsula o wslc.exe) e pela de demonstração (`mock.ts`).
 */
export interface WslcService {
  getEnvironment(): Promise<WslcEnvironment>
  listContainers(all: boolean): Promise<ContainerInfo[]>
  listImages(): Promise<ImageInfo[]>
  /** `opts` traz sinal/espera do stop e forçar/volumes do remove. */
  containerAction(action: ContainerAction, id: string, opts?: ContainerActionOptions): Promise<CommandResult>
  pruneContainers(): Promise<CommandResult>
  runContainer(opts: RunContainerOptions): Promise<CommandResult>
  execInContainer(id: string, command: string, opts?: ExecOptions): Promise<CommandResult>
  getStats(): Promise<ContainerStats[]>
  inspectContainer(id: string): Promise<CommandResult>
  /** Sinal imediato (padrão SIGKILL). */
  killContainer(id: string, signal?: string): Promise<CommandResult>
  /** Filesystem do container → tarball no caminho dado. */
  exportContainer(id: string, path: string): Promise<CommandResult>
  /** `container cp`: copia arquivos host ↔ container (não existe no SDK). */
  copyFiles(opts: ContainerCopyOptions): Promise<CommandResult>
  /** `opts.force` remove mesmo em uso; `noPrune` guarda as camadas pai. */
  removeImage(ref: string, opts?: RemoveImageOptions): Promise<CommandResult>
  pruneImages(): Promise<CommandResult>
  inspectImage(ref: string): Promise<CommandResult>
  tagImage(source: string, target: string): Promise<CommandResult>
  saveImage(ref: string, path: string): Promise<CommandResult>
  /** Login em registry (server vazio = padrão da sessão / Docker Hub). */
  login(server: string, username: string, password: string): Promise<CommandResult>
  /** Logout do registry (server vazio = padrão). */
  logout(server: string): Promise<CommandResult>
  listVolumes(): Promise<VolumeInfo[]>
  /** `vhd` exige a CLI >= 2.9.9 (`volume create -d vhd -o SizeBytes=...`). */
  createVolume(name: string, vhd?: VhdVolumeOptions, labels?: string[]): Promise<CommandResult>
  /** `force` é o -f da CLI: idempotência (não erra se o volume não existir). */
  removeVolume(name: string, force?: boolean): Promise<CommandResult>
  pruneVolumes(): Promise<CommandResult>
  inspectVolume(name: string): Promise<CommandResult>
  listNetworks(): Promise<NetworkInfo[]>
  createNetwork(opts: CreateNetworkOptions): Promise<CommandResult>
  /** `force` é o -f da CLI: idempotência (não erra se a rede não existir). */
  removeNetwork(name: string, force?: boolean): Promise<CommandResult>
  /** ATENÇÃO: a CLI remove sem confirmação (não existe --force aqui). */
  pruneNetworks(): Promise<CommandResult>
  inspectNetwork(name: string): Promise<CommandResult>
  connectNetwork(opts: ConnectNetworkOptions): Promise<CommandResult>
  disconnectNetwork(network: string, container: string): Promise<CommandResult>
  terminateSession(): Promise<CommandResult>
  listSessions(): Promise<WslcSessionInfo[]>
  /** `wslc settings reset`: volta o settings.yaml aos padrões. */
  resetWslcSettings(): Promise<CommandResult>
}
