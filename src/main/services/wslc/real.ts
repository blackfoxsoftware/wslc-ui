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
  WslcEnvironment
} from '@shared/schemas'
import { logDebug } from '../logger'
import { pushEach, pushOpt } from './args'
import { runCommand, wslc } from './cli'
import { parseJsonLines } from './json-lines'
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

/**
 * Roda um comando com `--format json` e faz o parse (array ou NDJSON).
 *
 * Devolve `null` quando a CLI recusa a opção ou responde algo que não é JSON —
 * é o sinal para o chamador cair no parser de tabela. Nenhuma exceção escapa
 * daqui: a saída da CLI não deve derrubar uma listagem.
 */
async function jsonList<T>(args: string[], timeoutMs?: number): Promise<T[] | null> {
  const res = await wslc([...args, '--format', 'json'], timeoutMs)
  if (!res.ok) return null
  try {
    return parseJsonLines<T>(res.stdout)
  } catch (err) {
    logDebug('cli', `${args.join(' ')} --format json não veio em JSON`, String(err))
    return null
  }
}

/** `wslc container list --format json`. */
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
  /** Desde quando está neste estado (segundos unix). Novo na CLI 2.9.9. */
  StateChangedAt?: number
}

interface CliStatsJson {
  ID: string
  Name: string
  CPUPerc: string
  MemUsage: string
  MemPerc: string
  NetIO: string
  BlockIO: string
  /** Novo na CLI 2.9.9 — ainda não exibido. */
  PIDs?: number
}

/** `wslc network list --format json`. A CLI 2.9.9 usa `ID`; a 2.9.4 usava `Id`. */
interface CliNetworkJson {
  Driver: string
  ID?: string
  Id?: string
  Name: string
}

/** `wslc image list --format json` (a partir da 2.9.9). */
interface CliImageJson {
  Repository: string
  Tag: string
  ID: string
  /** relativo e localizado, igual à coluna CRIADO da tabela */
  CreatedSince: string
  Size: string
}

/** `wslc volume list --format json` (a partir da 2.9.9). */
interface CliVolumeJson {
  Name: string
  Driver: string
  Mountpoint: string
  Scope: string
}

const IPPROTO_UDP = 17

function formatCliPorts(ports: CliPortJson[]): string {
  return ports
    .map((p) => {
      const proto = p.Protocol === IPPROTO_UDP ? 'udp' : 'tcp'
      // A CLI mostra o endereço de bind quando existe (127.0.0.1:8080->80/tcp).
      const bind = p.BindingAddress ? `${p.BindingAddress}:` : ''
      return `${bind}${p.HostPort}->${p.ContainerPort}/${proto}`
    })
    .join(', ')
}

const MINUTO = 60
const HORA = 60 * MINUTO
const DIA = 24 * HORA
const MES = 30 * DIA

const plural = (n: number, um: string, muitos: string): string => `há ${n} ${n === 1 ? um : muitos}`

/** "há 6 horas" — o mesmo tempo relativo que a coluna STATUS da tabela mostra. */
function tempoRelativo(unixSeconds: number, agora = Date.now()): string {
  const s = Math.max(0, Math.floor(agora / 1000) - unixSeconds)
  if (s < MINUTO) return 'há segundos'
  if (s < HORA) return plural(Math.floor(s / MINUTO), 'minuto', 'minutos')
  if (s < DIA) return plural(Math.floor(s / HORA), 'hora', 'horas')
  if (s < MES) return plural(Math.floor(s / DIA), 'dia', 'dias')
  return plural(Math.floor(s / MES), 'mês', 'meses')
}

function mapCliContainer(c: CliContainerJson): ContainerInfo {
  const { state, status } = mapNativeState(c.State, null)
  return {
    id: c.Id.slice(0, 12),
    name: c.Name,
    image: c.Image,
    command: '',
    created: formatUnixDate(c.CreatedAt),
    // Sem o StateChangedAt o status fica só "Encerrado"; com ele fica
    // "Encerrado há 6 horas", que é o que a tabela da CLI mostra.
    status: c.StateChangedAt === undefined ? status : `${status} ${tempoRelativo(c.StateChangedAt)}`,
    state,
    ports: formatCliPorts(c.Ports ?? [])
  }
}

async function getEnvironment(): Promise<WslcEnvironment> {
  const wslRes = await runCommand('wsl.exe', ['--version'], 15_000)
  const wslInstalled = wslRes.ok || wslRes.stdout.trim().length > 0
  const wslVersion = wslInstalled ? firstVersion(wslRes.stdout) : null

  // `version --format json` existe a partir da 2.9.9: {"Client":{"Version":"2.9.9.0"}}.
  const asJson = await jsonList<{ Client?: { Version?: string } }>(['version'], 15_000)
  let wslcAvailable = asJson !== null
  let wslcVersion = asJson?.[0]?.Client?.Version ?? null

  if (wslcVersion === null) {
    const wslcRes = await wslc(['version'], 15_000)
    wslcAvailable = wslcRes.ok
    wslcVersion = wslcAvailable ? (firstVersion(wslcRes.stdout) ?? (wslcRes.stdout.trim() || null)) : null
  }

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
  // Preferência: --format json — imune a locale (os cabeçalhos da tabela são
  // traduzidos, ex.: "ID DO CONTÊINER").
  const args = ['container', 'list']
  if (all) args.push('--all')
  const rows = await jsonList<CliContainerJson>(args)
  if (rows !== null) return rows.map(mapCliContainer)
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
  const rows = await jsonList<CliImageJson>(['image', 'list'])
  if (rows !== null) {
    return rows.map((i) => ({
      repository: i.Repository,
      tag: i.Tag,
      id: i.ID.slice(0, 12),
      created: i.CreatedSince,
      size: i.Size
    }))
  }
  const res = await wslc(['image', 'list'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar imagens')
  return parseTable(res.stdout).map((row) => ({
    repository: pick(row, 'REPOSITORY', 'REPOSITÓRIO', 'NAME'),
    tag: pick(row, 'TAG', 'MARCA'),
    id: pick(row, 'IMAGE ID', 'ID DA IMAGEM', 'ID'),
    created: pick(row, 'CREATED', 'CREATED AT', 'CRIADO'),
    size: pick(row, 'SIZE', 'TAMANHO')
  }))
}

async function listVolumes(): Promise<VolumeInfo[]> {
  const rows = await jsonList<CliVolumeJson>(['volume', 'list'])
  if (rows !== null) {
    return rows.map((v) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      scope: v.Scope
    }))
  }
  const res = await wslc(['volume', 'list'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar volumes')
  return parseTable(res.stdout).map((row) => ({
    name: pick(row, 'VOLUME NAME', 'NOME DO VOLUME', 'NAME', 'NOME'),
    driver: pick(row, 'DRIVER'),
    mountpoint: pick(row, 'MOUNTPOINT', 'MOUNT POINT', 'PONTO DE MONTAGEM'),
    scope: pick(row, 'SCOPE', 'ESCOPO')
  }))
}

async function listNetworks(): Promise<NetworkInfo[]> {
  const res = await wslc(['network', 'list', '--format', 'json'])
  if (!res.ok) throw new Error(res.stderr || res.stdout || 'Falha ao listar redes')
  // `ID` na CLI 2.9.9; `Id` na 2.9.4. Ler os dois evita depender da versão.
  const rows = parseJsonLines<CliNetworkJson>(res.stdout)
  return rows.map((n) => ({ id: (n.ID ?? n.Id ?? '').slice(0, 12), name: n.Name, driver: n.Driver }))
}

async function getStats(): Promise<ContainerStats[]> {
  // A CLI >= 2.9.4 já é snapshot por padrão (o antigo --no-stream deixou de
  // existir; passá-lo hoje é erro de uso). Sobrou a tabela como alternativa.
  const rows = await jsonList<CliStatsJson>(['stats'], 30_000)
  if (rows !== null) {
    return rows.map((r) => ({
      id: r.ID.slice(0, 12),
      name: r.Name,
      cpuPercent: Number.parseFloat(r.CPUPerc) || 0,
      memUsage: r.MemUsage,
      memPercent: Number.parseFloat(r.MemPerc) || 0,
      netIO: r.NetIO,
      blockIO: r.BlockIO
    }))
  }
  const legacy = await wslc(['stats'], 30_000)
  if (!legacy.ok) return []
  return parseStatsTable(legacy.stdout)
}

/** Monta o `wslc volume create` (exportado para testes). */
export function buildCreateVolumeArgs(name: string, vhd?: VhdVolumeOptions, labels?: string[]): string[] {
  const args = ['volume', 'create']
  // A CLI 2.9.9 ganhou -d/-o/-l; o driver vhd aceita exatamente as mesmas
  // opções do SDK nativo (SizeBytes obrigatório; Uid e Gid só valem em par).
  if (vhd) {
    args.push('-d', 'vhd', '-o', `SizeBytes=${vhd.sizeMb * 1024 * 1024}`)
    if (vhd.fixed) args.push('-o', 'Fixed=true')
    if (vhd.owner) args.push('-o', `Uid=${vhd.owner.uid}`, '-o', `Gid=${vhd.owner.gid}`)
  }
  pushEach(args, '-l', labels)
  args.push(name)
  return args
}

/** Monta os argumentos do `wslc network create` (exportado para testes). */
export function buildCreateNetworkArgs(opts: CreateNetworkOptions): string[] {
  const args = ['network', 'create']
  if (opts.driver?.trim()) args.push('-d', opts.driver.trim())
  if (opts.subnet?.trim()) args.push('--subnet', opts.subnet.trim())
  if (opts.gateway?.trim()) args.push('--gateway', opts.gateway.trim())
  // --ip-range chegou na 2.9.8 (PR #41138): restringe de onde saem os IPs
  // atribuídos automaticamente, sem mudar o tamanho da rede.
  if (opts.ipRange?.trim()) args.push('--ip-range', opts.ipRange.trim())
  if (opts.internal) args.push('--internal')
  for (const label of opts.labels ?? []) if (label.trim()) args.push('-l', label.trim())
  for (const opt of opts.options ?? []) if (opt.trim()) args.push('-o', opt.trim())
  args.push(opts.name.trim())
  return args
}

/**
 * Monta o `wslc network connect` (exportado para testes).
 *
 * Rede e container são posicionais, nessa ordem; as cinco opções chegaram na
 * 2.9.8 e todas podem repetir, menos o --ip.
 */
export function buildConnectNetworkArgs(opts: ConnectNetworkOptions): string[] {
  const args = ['network', 'connect']
  pushEach(args, '--network-alias', opts.aliases)
  pushOpt(args, '--ip', opts.ip)
  pushEach(args, '--link', opts.links)
  pushEach(args, '--link-local-ip', opts.linkLocalIps)
  pushEach(args, '--driver-opt', opts.driverOpts)
  args.push(opts.network.trim(), opts.container.trim())
  return args
}

/**
 * Monta o `wslc container cp` (exportado para testes).
 *
 * A CLI decide a direção pelo prefixo `CONTAINER:` de um dos dois caminhos —
 * é a mesma sintaxe do docker. Só um dos lados leva o prefixo: com os dois,
 * a cópia container→container não existe.
 */
export function buildCopyArgs(opts: ContainerCopyOptions): string[] {
  const args = ['container', 'cp']
  if (opts.archive) args.push('-a')
  const dentro = `${opts.container.trim()}:${opts.containerPath.trim()}`
  const fora = opts.hostPath.trim()
  return opts.direction === 'to-container' ? [...args, fora, dentro] : [...args, dentro, fora]
}

/**
 * Monta a ação de container (exportado para testes).
 *
 * O wslc não tem `restart` (ver `containerAction`), então aqui só entram as
 * três ações diretas. `stop` aceita sinal e espera; `remove` aceita forçar e
 * levar os volumes anônimos — nenhuma das duas existia na 2.9.4.
 */
export function buildContainerActionArgs(
  action: Exclude<ContainerAction, 'restart'>,
  id: string,
  opts?: ContainerActionOptions
): string[] {
  if (action === 'start') return ['container', 'start', id]
  if (action === 'stop') {
    const args = ['container', 'stop']
    pushOpt(args, '-s', opts?.signal)
    if (opts?.timeout !== undefined) args.push('-t', String(opts.timeout))
    args.push(id)
    return args
  }
  const args = ['container', 'rm']
  if (opts?.force) args.push('-f')
  if (opts?.volumes) args.push('-v')
  args.push(id)
  return args
}

/**
 * Monta o `wslc exec` (exportado para testes).
 *
 * Sem shell no Windows (execFile), então a interpretação do comando fica com
 * o `sh -c` do container. `-d` desanexa: a CLI volta na hora e a saída do
 * processo não chega a ninguém.
 */
export function buildExecArgs(id: string, command: string, opts?: ExecOptions): string[] {
  const args = ['exec']
  if (opts?.detach) args.push('-d')
  pushOpt(args, '-u', opts?.user)
  pushOpt(args, '-w', opts?.workdir)
  pushEach(args, '-e', opts?.env)
  pushOpt(args, '--env-file', opts?.envFile)
  args.push(id, 'sh', '-c', command)
  return args
}

async function containerAction(
  action: ContainerAction,
  id: string,
  opts?: ContainerActionOptions
): Promise<CommandResult> {
  // O wslc não tem `restart` (diferente do docker) — emula com stop + start.
  // O sinal e a espera valem para o stop; o start não tem opções.
  if (action === 'restart') {
    const stopped = await wslc(buildContainerActionArgs('stop', id, opts))
    if (!stopped.ok) return stopped
    return wslc(['container', 'start', id])
  }
  return wslc(buildContainerActionArgs(action, id, opts))
}

/** Implementação real: encapsula a CLI wslc.exe via execFile (sem shell). */
export const realWslcService: WslcService = {
  getEnvironment,
  listContainers,
  listImages,
  containerAction,
  // NENHUM prune da wslc 2.9.9 aceita --force: passá-lo é erro de uso e o
  // comando nem roda. Também não há confirmação — quem pergunta é a UI.
  // `container prune` não tem opção alguma; `image`/`volume prune` precisam
  // de --all, senão limpam só as pendentes / os anônimos, e não o que os
  // rótulos “sem uso” prometem.
  pruneContainers: () => wslc(['container', 'prune']),
  runContainer: (opts: RunContainerOptions) => wslc(buildRunArgs(opts), 10 * 60_000),
  execInContainer: (id: string, command: string, opts?: ExecOptions) =>
    wslc(buildExecArgs(id, command, opts)),
  getStats,
  inspectContainer: (id: string) => wslc(['container', 'inspect', id]),
  killContainer: (id: string, signal?: string) => {
    const args = ['container', 'kill']
    if (signal?.trim()) args.push('-s', signal.trim())
    args.push(id)
    return wslc(args)
  },
  // Export pode demorar (tar do filesystem inteiro) — timeout de build.
  exportContainer: (id: string, path: string) => wslc(['container', 'export', '-o', path, id], 10 * 60_000),
  // Copiar uma pasta grande também é tar por baixo: mesmo timeout do export.
  copyFiles: (opts: ContainerCopyOptions) => wslc(buildCopyArgs(opts), 10 * 60_000),
  removeImage: (ref: string, opts?: RemoveImageOptions) => {
    const args = ['image', 'rm']
    if (opts?.force) args.push('-f')
    if (opts?.noPrune) args.push('--no-prune')
    args.push(ref)
    return wslc(args)
  },
  pruneImages: () => wslc(['image', 'prune', '--all']),
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
  createVolume: (name: string, vhd?: VhdVolumeOptions, labels?: string[]) =>
    wslc(buildCreateVolumeArgs(name, vhd, labels)),
  // O -f do `volume rm` e do `network rm` é idempotência, NÃO remoção forçada:
  // ele só cala o erro de "não existe" (útil na remoção em massa, onde outra
  // aba pode ter removido o mesmo item antes).
  removeVolume: (name: string, force?: boolean) =>
    wslc(force ? ['volume', 'rm', '-f', name] : ['volume', 'rm', name]),
  pruneVolumes: () => wslc(['volume', 'prune', '--all']),
  inspectVolume: (name: string) => wslc(['volume', 'inspect', name]),
  listNetworks,
  createNetwork: (opts: CreateNetworkOptions) => wslc(buildCreateNetworkArgs(opts)),
  removeNetwork: (name: string, force?: boolean) =>
    wslc(force ? ['network', 'remove', '-f', name] : ['network', 'remove', name]),
  // `network prune` NÃO tem --force (o -f dele é --filter) e apaga direto.
  pruneNetworks: () => wslc(['network', 'prune']),
  inspectNetwork: (name: string) => wslc(['network', 'inspect', name]),
  connectNetwork: (opts: ConnectNetworkOptions) => wslc(buildConnectNetworkArgs(opts)),
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
