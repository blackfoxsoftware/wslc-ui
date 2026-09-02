import type {
  CommandResult,
  ContainerInfo,
  ContainerStats,
  ImageInfo,
  NetworkInfo,
  VolumeInfo
} from '@shared/schemas'
import { failHard, failure, isEnvironmentInstalled, shouldFail } from './mock-state'
import type { WslcService } from './service'

/**
 * Modo de demonstração (WSLC_UI_MOCK=1): simula o wslc para desenvolver a UI
 * sem o WSL 2.9.3 pré-release instalado. Cada instância tem estado próprio
 * em memória, mutável. WSLC_UI_MOCK=setup simula a máquina SEM o ambiente
 * pronto — mostra o SetupView (com a instalação guiada da Fase 6).
 *
 * Cada operação consulta `shouldFail` (WSLC_UI_MOCK_FAIL) antes de agir: é
 * assim que o caminho triste de cada tela vira reproduzível.
 */

const ok = (stdout = ''): CommandResult => ({ ok: true, code: 0, stdout, stderr: '' })

/** Valores oscilantes para a UI de monitoramento ter vida no modo demo. */
const jitter = (base: number, spread: number): number => Math.max(0, base + (Math.random() - 0.5) * spread)

/**
 * Ponte para o dublê dos streams: um pull/load/build que termina precisa
 * fazer a imagem APARECER na lista deste serviço.
 */
export interface MockWorld {
  addImage(repository: string, tag: string): void
}

let current: MockWorld | null = null

/** Último dublê criado — é o que a camada IPC está usando. */
export function currentMockWorld(): MockWorld | null {
  return current
}

export function createMockWslcService(): WslcService {
  const containers: ContainerInfo[] = [
    {
      id: 'a1b2c3d4e5f6',
      name: 'web',
      image: 'nginx:latest',
      command: 'nginx -g daemon off;',
      created: 'há 2 horas',
      status: 'Up 2 hours',
      state: 'running',
      ports: '0.0.0.0:8080->80/tcp'
    },
    {
      id: 'f6e5d4c3b2a1',
      name: 'db',
      image: 'postgres:latest',
      command: 'postgres',
      created: 'ontem',
      status: 'Exited (0) 3 hours ago',
      state: 'exited',
      ports: ''
    }
  ]

  const images: ImageInfo[] = [
    { repository: 'nginx', tag: 'latest', id: 'sha256aaa111', created: 'há 3 dias', size: '192 MB' },
    { repository: 'postgres', tag: 'latest', id: 'sha256bbb222', created: 'há 1 semana', size: '438 MB' },
    { repository: 'alpine', tag: 'latest', id: 'sha256ccc333', created: 'há 2 semanas', size: '5.6 MB' }
  ]

  // Os drivers e o mountpoint imitam a wslc 2.9.9: `guest` é o padrão e o
  // `vhd` passou a existir também na CLI (era exclusivo do motor nativo).
  const volumes: VolumeInfo[] = [
    { name: 'pgdata', driver: 'guest', mountpoint: '/var/lib/docker/volumes/pgdata/_data', scope: 'local' },
    {
      name: 'site-static',
      driver: 'guest',
      mountpoint: '/var/lib/docker/volumes/site-static/_data',
      scope: 'local'
    }
  ]

  // A CLI 2.9.9 passou a listar as redes predefinidas do docker junto com as
  // gerenciadas pela sessão — elas aparecem, mas não podem ser removidas.
  const networks: NetworkInfo[] = [
    { id: 'd2a0fec3fd2a', name: 'bridge', driver: 'bridge' },
    { id: 'f5287a761725', name: 'frontend', driver: 'bridge' },
    { id: '8f1013ae0e91', name: 'host', driver: 'host' },
    { id: 'ff9c46352e43', name: 'none', driver: 'null' }
  ]

  // Labels dos volumes: a CLI aceita -l, mas `volume list` não os mostra —
  // guardamos aqui para o `volume inspect` refletir o que foi pedido.
  const volumeLabels = new Map<string, string[]>()

  let nextId = 1

  current = {
    addImage: (repository, tag) => {
      if (images.some((i) => i.repository === repository && i.tag === tag)) return
      images.unshift({
        repository,
        tag,
        id: `sha256mock${String(nextId++).padStart(3, '0')}`,
        created: 'agora',
        size: '64 MB'
      })
    }
  }

  return {
    async getEnvironment() {
      // A instalação guiada deixa o ambiente pronto: "Verificar novamente"
      // passa a responder que sim.
      if (process.env['WSLC_UI_MOCK'] === 'setup' && !isEnvironmentInstalled()) {
        return {
          wslInstalled: true,
          wslVersion: '2.7.12.0',
          wslVersionOk: false,
          wslcAvailable: false,
          wslcVersion: null,
          ready: false
        }
      }
      return {
        wslInstalled: true,
        wslVersion: '2.9.3.0',
        wslVersionOk: true,
        wslcAvailable: true,
        wslcVersion: 'mock',
        ready: true
      }
    },

    async listContainers(all) {
      if (shouldFail('containers:list')) failHard('containers:list', 'Não foi possível listar os containers.')
      return all ? [...containers] : containers.filter((c) => c.state === 'running')
    },

    async listImages() {
      if (shouldFail('images:list')) failHard('images:list', 'Não foi possível listar as imagens.')
      return [...images]
    },

    async containerAction(action, id, opts) {
      if (shouldFail('containers:action')) return failure('containers:action', `Falha ao ${action}.`)
      const c = containers.find((x) => x.id === id || x.name === id)
      if (!c) return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${id}` }
      if (action === 'remove') {
        // Como a CLI: remover container em execução exige -f. É o que faz a
        // UI oferecer "forçar" no toast em vez de esconder a ação.
        if (c.state === 'running' && !opts?.force) {
          return {
            ok: false,
            code: 1,
            stdout: '',
            stderr: `Não é possível remover o contêiner "${c.name}": ele está em execução. Pare-o antes ou use a remoção forçada.`
          }
        }
        containers.splice(containers.indexOf(c), 1)
      } else if (action === 'stop') {
        const sinal = opts?.signal?.trim() ? ` por ${opts.signal.trim()}` : ''
        Object.assign(c, { state: 'exited', status: `Exited (0) agora${sinal}` })
      } else Object.assign(c, { state: 'running', status: 'Up agora' })
      return ok()
    },

    async pruneContainers() {
      if (shouldFail('containers:prune')) return failure('containers:prune', 'Falha ao remover os parados.')
      for (let i = containers.length - 1; i >= 0; i--) {
        if (containers[i].state !== 'running') containers.splice(i, 1)
      }
      return ok()
    },

    async runContainer(opts) {
      if (shouldFail('containers:run')) return failure('containers:run', 'Falha ao criar o container.')
      containers.unshift({
        id: `mock${String(nextId++).padStart(8, '0')}`,
        name: opts.name || `mock-${containers.length + 1}`,
        image: opts.image,
        command: opts.command ?? '',
        created: 'agora',
        status: opts.detach ? 'Up agora' : 'Exited (0) agora',
        state: opts.detach ? 'running' : 'exited',
        ports: (opts.ports ?? []).map((p) => `0.0.0.0:${p.replace(':', '->')}/tcp`).join(', ')
      })
      return ok()
    },

    async execInContainer(_id, command, opts) {
      if (shouldFail('containers:exec')) return failure('containers:exec', 'Falha ao executar o comando.')
      // Desanexado não devolve saída (a CLI volta antes do processo terminar).
      if (opts?.detach) return ok()
      const onde = opts?.workdir?.trim() ? ` em ${opts.workdir.trim()}` : ''
      const quem = opts?.user?.trim() ? ` como ${opts.user.trim()}` : ''
      const vars = (opts?.env ?? []).filter((e) => e.trim())
      return ok(
        `(mock) executado${quem}${onde}: ${command}\n` +
          (vars.length > 0 ? `(mock) variáveis: ${vars.join(' ')}\n` : '') +
          'Linux mock-container 6.6.87 x86_64 GNU/Linux\n'
      )
    },

    async getStats() {
      return containers
        .filter((c) => c.state === 'running')
        .map((c, i): ContainerStats => {
          const cpu = jitter(8 + i * 14, 10)
          const memPct = jitter(12 + i * 9, 6)
          return {
            id: c.id,
            name: c.name,
            cpuPercent: Number(cpu.toFixed(2)),
            memUsage: `${((memPct / 100) * 4096).toFixed(0)}MiB / 4GiB`,
            memPercent: Number(memPct.toFixed(2)),
            netIO: '1.2kB / 3.4kB',
            blockIO: '12MB / 0B'
          }
        })
    },

    async inspectContainer(id) {
      if (shouldFail('containers:inspect')) return failure('containers:inspect', 'Falha ao inspecionar.')
      const c = containers.find((x) => x.id === id || x.name === id)
      if (!c) return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${id}` }
      return ok(
        JSON.stringify(
          [
            {
              Id: c.id,
              Name: `/${c.name}`,
              Image: c.image,
              State: { Status: c.state, Running: c.state === 'running', ExitCode: 0 },
              Config: { Cmd: c.command.split(' '), Env: ['PATH=/usr/local/sbin:/usr/local/bin'] },
              NetworkSettings: { Ports: c.ports ? { '80/tcp': [{ HostPort: '8080' }] } : {} },
              Mounts: []
            }
          ],
          null,
          2
        )
      )
    },

    async removeImage(ref, opts) {
      if (shouldFail('images:remove')) return failure('images:remove', `Falha ao remover "${ref}".`)
      const idx = images.findIndex((i) => `${i.repository}:${i.tag}` === ref || i.id === ref)
      // Como a CLI: imagem usada por um container só sai com -f.
      const emUso = containers.find((c) => c.image === ref)
      if (idx >= 0 && emUso && !opts?.force) {
        return {
          ok: false,
          code: 1,
          stdout: '',
          stderr: `Não é possível remover a imagem "${ref}": ela está em uso pelo contêiner "${emUso.name}".`
        }
      }
      if (idx >= 0) images.splice(idx, 1)
      return ok()
    },

    async pruneImages() {
      if (shouldFail('images:prune')) return failure('images:prune', 'Falha ao remover as imagens sem uso.')
      return ok()
    },

    async inspectImage(ref) {
      if (shouldFail('images:inspect')) return failure('images:inspect', 'Falha ao inspecionar a imagem.')
      const img = images.find((i) => `${i.repository}:${i.tag}` === ref || i.id === ref)
      if (!img) return { ok: false, code: 1, stdout: '', stderr: `imagem não encontrada: ${ref}` }
      return ok(
        JSON.stringify(
          [
            {
              Id: img.id,
              RepoTags: [`${img.repository}:${img.tag}`],
              Created: img.created,
              Size: img.size,
              Architecture: 'amd64',
              Os: 'linux',
              Config: { Cmd: ['/bin/sh'], ExposedPorts: {} }
            }
          ],
          null,
          2
        )
      )
    },

    async tagImage(source, target) {
      if (shouldFail('images:tag')) return failure('images:tag', `Falha ao criar a tag "${target}".`)
      const img = images.find((i) => `${i.repository}:${i.tag}` === source || i.id === source)
      if (!img) return { ok: false, code: 1, stdout: '', stderr: `imagem não encontrada: ${source}` }
      const idx = target.lastIndexOf(':')
      const repository = idx > 0 ? target.slice(0, idx) : target
      const tag = idx > 0 ? target.slice(idx + 1) : 'latest'
      images.push({ ...img, repository, tag })
      return ok()
    },

    async saveImage(ref) {
      if (shouldFail('images:save')) return failure('images:save', `Falha ao salvar "${ref}".`)
      const img = images.find((i) => `${i.repository}:${i.tag}` === ref || i.id === ref)
      if (!img) return { ok: false, code: 1, stdout: '', stderr: `imagem não encontrada: ${ref}` }
      return ok()
    },

    async login(server, username) {
      if (shouldFail('registry:login')) return failure('registry:login', 'Usuário ou senha inválidos.')
      return {
        ok: true,
        code: 0,
        stdout: `Login em ${server || 'docker.io'} como ${username} OK.`,
        stderr: ''
      }
    },

    async listVolumes() {
      if (shouldFail('volumes:list')) failHard('volumes:list', 'Não foi possível listar os volumes.')
      return [...volumes]
    },

    async createVolume(name, vhd, labels) {
      if (shouldFail('volumes:create')) return failure('volumes:create', `Falha ao criar o volume "${name}".`)
      if (volumes.some((v) => v.name === name)) {
        return { ok: false, code: 1, stdout: '', stderr: `volume já existe: ${name}` }
      }
      volumes.push({
        name,
        driver: vhd ? 'vhd' : 'guest',
        mountpoint: `/var/lib/docker/volumes/${name}/_data`,
        scope: 'local'
      })
      volumeLabels.set(
        name,
        (labels ?? []).filter((l) => l.trim())
      )
      return ok()
    },

    async removeVolume(name, force) {
      if (shouldFail('volumes:remove')) return failure('volumes:remove', `Falha ao remover "${name}".`)
      const idx = volumes.findIndex((v) => v.name === name)
      // -f aqui é idempotência: sem ele, remover o que não existe é erro.
      if (idx < 0) {
        return force ? ok() : { ok: false, code: 1, stdout: '', stderr: `volume não encontrado: ${name}` }
      }
      volumes.splice(idx, 1)
      volumeLabels.delete(name)
      return ok()
    },

    async pruneVolumes() {
      if (shouldFail('volumes:prune')) return failure('volumes:prune', 'Falha ao remover os volumes sem uso.')
      return ok()
    },

    async inspectVolume(name) {
      if (shouldFail('volumes:inspect')) return failure('volumes:inspect', 'Falha ao inspecionar o volume.')
      const vol = volumes.find((v) => v.name === name)
      if (!vol) return { ok: false, code: 1, stdout: '', stderr: `volume não encontrado: ${name}` }
      return ok(
        JSON.stringify(
          [
            {
              Name: vol.name,
              Driver: vol.driver,
              CreatedAt: '2026-09-01T12:00:00Z',
              Labels: Object.fromEntries(
                (volumeLabels.get(vol.name) ?? []).map((l) => {
                  const i = l.indexOf('=')
                  return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)]
                })
              ),
              Status: null
            }
          ],
          null,
          2
        )
      )
    },

    async killContainer(id) {
      if (shouldFail('containers:kill')) return failure('containers:kill', 'Falha ao encerrar o container.')
      const c = containers.find((x) => x.id === id || x.name === id)
      if (!c) return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${id}` }
      Object.assign(c, { state: 'exited', status: 'Exited (137) agora' })
      return ok()
    },

    async exportContainer(id) {
      if (shouldFail('containers:export')) return failure('containers:export', 'Falha ao exportar.')
      const c = containers.find((x) => x.id === id || x.name === id)
      if (!c) return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${id}` }
      return ok()
    },

    async copyFiles(opts) {
      if (shouldFail('containers:copy')) return failure('containers:copy', 'Falha ao copiar os arquivos.')
      const c = containers.find((x) => x.id === opts.container || x.name === opts.container)
      if (!c) {
        return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${opts.container}` }
      }
      const dentro = `${c.name}:${opts.containerPath}`
      const [de, para] = opts.direction === 'to-container' ? [opts.hostPath, dentro] : [dentro, opts.hostPath]
      return ok(`(mock) copiado ${de} → ${para}\n`)
    },

    async logout(server) {
      if (shouldFail('registry:logout')) return failure('registry:logout', 'Falha ao sair do registry.')
      return ok(`Logout de ${server || 'docker.io'} OK.`)
    },

    async listNetworks() {
      if (shouldFail('networks:list')) failHard('networks:list', 'Não foi possível listar as redes.')
      return [...networks]
    },

    async createNetwork(opts) {
      if (shouldFail('networks:create')) {
        return failure('networks:create', `Falha ao criar a rede "${opts.name}".`)
      }
      if (networks.some((n) => n.name === opts.name)) {
        return { ok: false, code: 1, stdout: '', stderr: `rede já existe: ${opts.name}` }
      }
      networks.push({
        id: `mocknet${String(nextId++).padStart(5, '0')}`,
        name: opts.name,
        driver: opts.driver || 'bridge'
      })
      return ok(opts.name)
    },

    async removeNetwork(name, force) {
      if (shouldFail('networks:remove')) return failure('networks:remove', `Falha ao remover "${name}".`)
      const idx = networks.findIndex((n) => n.name === name || n.id === name)
      // -f aqui é idempotência (não é remoção forçada): cala o "não existe".
      if (idx < 0) {
        return force ? ok() : { ok: false, code: 1, stdout: '', stderr: `Rede não encontrada: '${name}'` }
      }
      networks.splice(idx, 1)
      return ok()
    },

    async pruneNetworks() {
      if (shouldFail('networks:prune')) return failure('networks:prune', 'Falha ao remover as redes sem uso.')
      const removed = networks.splice(1).map((n) => n.name)
      return ok(removed.map((n) => `Excluído: ${n}`).join('\n'))
    },

    async inspectNetwork(name) {
      if (shouldFail('networks:inspect')) return failure('networks:inspect', 'Falha ao inspecionar a rede.')
      const net = networks.find((n) => n.name === name || n.id === name)
      if (!net) return { ok: false, code: 1, stdout: '', stderr: `Rede não encontrada: '${name}'` }
      return ok(
        JSON.stringify(
          [
            {
              Name: net.name,
              Id: net.id,
              Driver: net.driver,
              Scope: 'local',
              Internal: false,
              IPAM: { Driver: 'default', Config: [{ Subnet: '172.18.0.0/16', Gateway: '172.18.0.1' }] },
              Labels: {}
            }
          ],
          null,
          2
        )
      )
    },

    async connectNetwork(opts) {
      if (shouldFail('networks:connect')) {
        return failure('networks:connect', 'Falha ao conectar o container.')
      }
      const net = networks.find((n) => n.name === opts.network || n.id === opts.network)
      if (!net) {
        return { ok: false, code: 1, stdout: '', stderr: `Rede não encontrada: '${opts.network}'` }
      }
      const c = containers.find((x) => x.id === opts.container || x.name === opts.container)
      if (!c) {
        return { ok: false, code: 1, stdout: '', stderr: `container não encontrado: ${opts.container}` }
      }
      const alias = (opts.aliases ?? []).filter((a) => a.trim())
      const detalhe = [
        alias.length > 0 ? `aliases ${alias.join(', ')}` : '',
        opts.ip?.trim() ? `ip ${opts.ip.trim()}` : ''
      ].filter(Boolean)
      return ok(detalhe.length > 0 ? `(mock) conectado com ${detalhe.join(' e ')}\n` : '')
    },

    async disconnectNetwork(network, container) {
      if (shouldFail('networks:disconnect')) {
        return failure('networks:disconnect', 'Falha ao desconectar o container.')
      }
      return this.connectNetwork({ network, container })
    },

    async terminateSession() {
      if (shouldFail('system:terminate-session')) {
        return failure('system:terminate-session', 'Falha ao encerrar a sessão.')
      }
      return ok()
    },

    async listSessions() {
      if (shouldFail('system:sessions')) failHard('system:sessions', 'Não foi possível listar as sessões.')
      return [{ id: '29', creatorPid: '8880', displayName: 'wslc-cli-mock' }]
    },

    async resetWslcSettings() {
      if (shouldFail('system:reset-wslc-settings')) {
        return failure('system:reset-wslc-settings', 'Falha ao redefinir as configurações.')
      }
      return ok('Configurações redefinidas para os padrões.')
    }
  }
}
