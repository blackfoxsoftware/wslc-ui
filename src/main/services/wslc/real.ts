import type {
  CommandResult,
  ContainerAction,
  ContainerInfo,
  CreateNetworkOptions,
  ImageInfo,
  NetworkInfo,
  RunContainerOptions,
  VolumeInfo,
  WslcEnvironment
} from '@shared/schemas'
import { runCommand, wslc } from './cli'
import { formatUnixDate } from './native/images'
import { mapNativeState } from './native/run-spec'
import { buildRunArgs } from './run-args'
import type { WslcService } from './service'
import { parseSessionTable } from './sessions'
import { parseStatsTable } from './stats'
import { parseTable, pick } from './table'
import { compareVersions, firstVersion, MIN_WSL_VERSION } from './version'

function inferState(status: string): ContainerInfo['state'] {
  const s = status.toLowerCase()
  if (s.startsWith('up') || s.includes('running') || s.includes('execução')) return 'running'
  if (s.startsWith('exited') || s.includes('stopped') || s.includes('encerrado')) return 'exited'
  if (s.startsWith('created') || s.includes('criado')) return 'created'
  return 'unknown'
}

/** `wslc container list --format json` (CLI >= 2.9.4). */
interface CliPortJson {
  BindingAddress?: string
  ContainerPort: number
  HostPort: number
  /** número de protocolo IP: 6 = TCP, 17 = UDP */
  Protocol: number
}

interface CliContainerJson {
  Id: string
  Name: string
  Image: string
  Ports?: CliPortJson[]
  /** mesmo enum numérico do SDK: 1 = created, 2 = running, 3 = exited */
  State: number
  CreatedAt: number
}

interface CliStatsJson {
  ID: string
  Name: string
  CPUPerc: string
  MemUsage: string
  MemPerc: string
  NetIO: string
  BlockIO: string
}

const IPPROTO_UDP = 17

function formatCliPorts(ports: CliPortJson[]): string {
  return ports
    .map((p) => `${p.HostPort}->${p.ContainerPort}/${p.Protocol === IPPROTO_UDP ? 'udp' : 'tcp'}`)
    .join(', ')
}

async function getEnvironment(): Promise<WslcEnvironment> {
  const wslRes = await runCommand('wsl.exe', ['--version'], 15_000)
  const wslInstalled = wslRes.ok || wslRes.stdout.trim().length > 0
  const wslVersion = wslInstalled ? firstVersion(wslRes.stdout) : null

  const wslcRes = await wslc(['version'], 15_000)
  const wslcAvailable = wslcRes.ok
  const wslcVersion = wslcAvailable ? (firstVersion(wslcRes.stdout) ?? (wslcRes.stdout.trim() || null)) : null

  const wslVersionOk = wslVersion !== null && compareVersions(wslVersion, MIN_WSL_VERSION) >= 0
  return {
    wslInstalled,
    wslVersion,
    wslVersionOk,
    wslcAvailable,
    wslcVersion,
    ready: wslcAvailable && wslVersionOk
  }
}

async function listContainers(all: boolean): Promise<ContainerInfo[]> {
  // Preferência: --format json (CLI >= 2.9.4) — imune a locale (os cabeçalhos
  // da tabela de containers são traduzidos, ex.: "ID DO CONTÊINER").
  const args = ['container', 'list', '--format', 'json']
  if (all) args.push('--all')
  const res = await wslc(args)
  if (res.ok) {
    try {
      const rows = JSON.parse(res.stdout || '[]') as CliContainerJson[]
      return rows.map((c) => {
        const { state, status } = mapNativeState(c.State, null)
        return {
          id: c.Id.slice(0, 12),
          name: c.Name,
          image: c.Image,
          command: '',
          created: formatUnixDate(c.CreatedAt),
          status,
          state,
          ports: formatCliPorts(c.Ports ?? [])
        }
      })
    } catch {
      // saída inesperada — cai para o parser de tabela
    }
  }
  return listContainersLegacy(all)
}

/** Fallback para CLIs sem --format json: parse da tabela (inglês ou pt-BR). */
async function listContainersLegacy(all: boolean): Promise<ContainerInfo[]> {
  const args = ['container', 'list']
  if (all) args.push('--all')
  const res = await wslc(args)
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar containers')
  return parseTable(res.stdout).map((row) => {
    const status = pick(row, 'STATUS', 'STATE')
    return {
      id: pick(row, 'CONTAINER ID', 'ID DO CONTÊINER', 'ID'),
      name: pick(row, 'NAMES', 'NAME', 'NOME'),
      image: pick(row, 'IMAGE', 'IMAGEM'),
      command: pick(row, 'COMMAND', 'COMANDO'),
      created: pick(row, 'CREATED', 'CREATED AT', 'CRIADO'),
      status,
      state: inferState(status),
      ports: pick(row, 'PORTS', 'PORTAS')
    }
  })
}

async function listImages(): Promise<ImageInfo[]> {
  const res = await wslc(['image', 'list'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar imagens')
  return parseTable(res.stdout).map((row) => ({
    repository: pick(row, 'REPOSITORY', 'NAME'),
    tag: pick(row, 'TAG'),
    id: pick(row, 'IMAGE ID', 'ID'),
    created: pick(row, 'CREATED', 'CREATED AT'),
    size: pick(row, 'SIZE')
  }))
}

async function listVolumes(): Promise<VolumeInfo[]> {
  const res = await wslc(['volume', 'list'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar volumes')
  return parseTable(res.stdout).map((row) => ({
    name: pick(row, 'VOLUME NAME', 'NAME'),
    driver: pick(row, 'DRIVER'),
    mountpoint: pick(row, 'MOUNTPOINT', 'MOUNT POINT'),
    scope: pick(row, 'SCOPE')
  }))
}

/** `wslc network list --format json`: [{Driver, Id, Name}]. */
interface CliNetworkJson {
  Driver: string
  Id: string
  Name: string
}

async function listNetworks(): Promise<NetworkInfo[]> {
  const res = await wslc(['network', 'list', '--format', 'json'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar redes')
  const rows = JSON.parse(res.stdout || '[]') as CliNetworkJson[]
  return rows.map((n) => ({ id: n.Id.slice(0, 12), name: n.Name, driver: n.Driver }))
}

/** Monta os argumentos do `wslc network create` (exportado para testes). */
export function buildCreateNetworkArgs(opts: CreateNetworkOptions): string[] {
  const args = ['network', 'create']
  if (opts.driver?.trim()) args.push('-d', opts.driver.trim())
  if (opts.subnet?.trim()) args.push('--subnet', opts.subnet.trim())
  if (opts.gateway?.trim()) args.push('--gateway', opts.gateway.trim())
  if (opts.internal) args.push('--internal')
  for (const label of opts.labels ?? []) if (label.trim()) args.push('-l', label.trim())
  for (const opt of opts.options ?? []) if (opt.trim()) args.push('-o', opt.trim())
  args.push(opts.name.trim())
  return args
}

async function containerAction(action: ContainerAction, id: string): Promise<CommandResult> {
  // O wslc não tem `restart` (diferente do docker) — emula com stop + start.
  if (action === 'restart') {
    const stopped = await wslc(['container', 'stop', id])
    if (!stopped.ok) return stopped
    return wslc(['container', 'start', id])
  }
  const sub: Record<Exclude<ContainerAction, 'restart'>, string[]> = {
    start: ['container', 'start', id],
    stop: ['container', 'stop', id],
    remove: ['container', 'rm', id]
  }
  return wslc(sub[action])
}

/** Implementação real: encapsula a CLI wslc.exe via execFile (sem shell). */
export const realWslcService: WslcService = {
  getEnvironment,
  listContainers,
  listImages,
  containerAction,
  pruneContainers: () => wslc(['container', 'prune', '--force']),
  runContainer: (opts: RunContainerOptions) => wslc(buildRunArgs(opts), 10 * 60_000),
  // Sem shell no Windows (execFile), então delega a interpretação ao sh do container.
  execInContainer: (id: string, command: string) => wslc(['exec', id, 'sh', '-c', command]),
  getStats: async () => {
    // CLI >= 2.9.4: `stats` é snapshot por padrão e tem --format json
    // (o antigo `--no-stream` deixou de existir).
    const res = await wslc(['stats', '--format', 'json'], 30_000)
    if (res.ok) {
      try {
        const rows = JSON.parse(res.stdout || '[]') as CliStatsJson[]
        return rows.map((r) => ({
          id: r.ID.slice(0, 12),
          name: r.Name,
          cpuPercent: Number.parseFloat(r.CPUPerc) || 0,
          memUsage: r.MemUsage,
          memPercent: Number.parseFloat(r.MemPerc) || 0,
          netIO: r.NetIO,
          blockIO: r.BlockIO
        }))
      } catch {
        // saída inesperada — tenta o formato antigo
      }
    }
    const legacy = await wslc(['stats', '--no-stream'], 30_000)
    if (!legacy.ok) return []
    return parseStatsTable(legacy.stdout)
  },
  inspectContainer: (id: string) => wslc(['container', 'inspect', id]),
  killContainer: (id: string, signal?: string) => {
    const args = ['container', 'kill']
    if (signal?.trim()) args.push('-s', signal.trim())
    args.push(id)
    return wslc(args)
  },
  // Export pode demorar (tar do filesystem inteiro) — timeout de build.
  exportContainer: (id: string, path: string) => wslc(['container', 'export', '-o', path, id], 10 * 60_000),
  removeImage: (ref: string) => wslc(['image', 'rm', ref]),
  pruneImages: () => wslc(['image', 'prune', '--force']),
  inspectImage: (ref: string) => wslc(['image', 'inspect', ref]),
  tagImage: (source: string, target: string) => wslc(['tag', source, target]),
  saveImage: (ref: string, path: string) => wslc(['image', 'save', '-o', path, ref]),
  // Senha via stdin — não vai para a linha de comando nem para os logs.
  login: (server: string, username: string, password: string) => {
    const args = ['login', '-u', username, '--password-stdin']
    if (server.trim()) args.push(server.trim())
    return wslc(args, 60_000, `${password}\n`)
  },
  logout: (server: string) => {
    const args = ['logout']
    if (server.trim()) args.push(server.trim())
    return wslc(args)
  },
  listVolumes,
  createVolume: (name: string) => wslc(['volume', 'create', name]),
  removeVolume: (name: string) => wslc(['volume', 'rm', name]),
  pruneVolumes: () => wslc(['volume', 'prune', '--force']),
  inspectVolume: (name: string) => wslc(['volume', 'inspect', name]),
  listNetworks,
  createNetwork: (opts: CreateNetworkOptions) => wslc(buildCreateNetworkArgs(opts)),
  removeNetwork: (name: string) => wslc(['network', 'remove', name]),
  // `network prune` NÃO tem --force (o -f dele é --filter) e apaga direto.
  pruneNetworks: () => wslc(['network', 'prune']),
  inspectNetwork: (name: string) => wslc(['network', 'inspect', name]),
  connectNetwork: (network: string, container: string) => wslc(['network', 'connect', network, container]),
  disconnectNetwork: (network: string, container: string) =>
    wslc(['network', 'disconnect', network, container]),
  terminateSession: () => wslc(['system', 'session', 'terminate']),
  listSessions: async () => {
    const res = await wslc(['system', 'session', 'list'])
    if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar sessões')
    return parseSessionTable(res.stdout)
  },
  resetWslcSettings: () => wslc(['settings', 'reset'])
}
