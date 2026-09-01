import type {
  CommandResult,
  ContainerAction,
  ContainerInfo,
  ContainerStats,
  CreateNetworkOptions,
  ImageInfo,
  NetworkInfo,
  RunContainerOptions,
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
  containerAction(action: ContainerAction, id: string): Promise<CommandResult>
  pruneContainers(): Promise<CommandResult>
  runContainer(opts: RunContainerOptions): Promise<CommandResult>
  execInContainer(id: string, command: string): Promise<CommandResult>
  getStats(): Promise<ContainerStats[]>
  inspectContainer(id: string): Promise<CommandResult>
  /** Sinal imediato (padrão SIGKILL). */
  killContainer(id: string, signal?: string): Promise<CommandResult>
  /** Filesystem do container → tarball no caminho dado. */
  exportContainer(id: string, path: string): Promise<CommandResult>
  removeImage(ref: string): Promise<CommandResult>
  pruneImages(): Promise<CommandResult>
  inspectImage(ref: string): Promise<CommandResult>
  tagImage(source: string, target: string): Promise<CommandResult>
  saveImage(ref: string, path: string): Promise<CommandResult>
  /** Login em registry (server vazio = padrão da sessão / Docker Hub). */
  login(server: string, username: string, password: string): Promise<CommandResult>
  /** Logout do registry (server vazio = padrão). */
  logout(server: string): Promise<CommandResult>
  listVolumes(): Promise<VolumeInfo[]>
  createVolume(name: string): Promise<CommandResult>
  removeVolume(name: string): Promise<CommandResult>
  pruneVolumes(): Promise<CommandResult>
  inspectVolume(name: string): Promise<CommandResult>
  listNetworks(): Promise<NetworkInfo[]>
  createNetwork(opts: CreateNetworkOptions): Promise<CommandResult>
  removeNetwork(name: string): Promise<CommandResult>
  /** ATENÇÃO: a CLI remove sem confirmação (não existe --force aqui). */
  pruneNetworks(): Promise<CommandResult>
  inspectNetwork(name: string): Promise<CommandResult>
  connectNetwork(network: string, container: string): Promise<CommandResult>
  disconnectNetwork(network: string, container: string): Promise<CommandResult>
  terminateSession(): Promise<CommandResult>
  listSessions(): Promise<WslcSessionInfo[]>
  /** `wslc settings reset`: volta o settings.yaml aos padrões. */
  resetWslcSettings(): Promise<CommandResult>
}
