import type {
  CommandResult,
  ContainerAction,
  ContainerInfo,
  ImageInfo,
  ImageProgressLayer,
  InstallProgressEvent,
  NativeCrashDumpEvent,
  NativeSessionEndedEvent,
  NativeStatus,
  NativeTuning,
  RegistryImage,
  RunContainerOptions,
  SdkProbe,
  VhdVolumeOptions,
  VolumeInfo
} from '@shared/schemas'
import { app } from 'electron'
import { logInfo } from '../logger'
import { createMockUpdateOps } from '../updater/mock'
import { currentMockWorld } from './mock'
import { failHard, failure, markEnvironmentInstalled, pickedPath, shouldFail, tickMs } from './mock-state'
import { allocStreamId, registerStream, releaseStream, type StreamSink } from './streams'
import { allocTerminalId, registerTerminal, releaseTerminal, type TerminalSink } from './terminals'
import type { HostOps, NativeOps, Ops, StreamOps } from './ops'

/**
 * Fronteiras de demonstração: uma sessão nativa fictícia, streams que
 * progridem sozinhos e efeitos externos que só registram no log em vez de
 * abrir janelas do Windows.
 *
 * A sessão nativa aqui imita as regras REAIS que a UI observa: ela tem
 * storage próprio (as listas não são as mesmas do motor CLI), reiniciar
 * mantém as imagens e derruba os containers para exited (a ABI 2.9.9 os
 * reabre), e resetar perde os dois.
 */

const ok = (stdout = ''): CommandResult => ({ ok: true, code: 0, stdout, stderr: '' })

// ————————————————————————————————————————————————— streams simulados

interface FakeStreamOptions {
  lines: string[]
  /** Progresso por camada, como o pull/push do motor nativo. */
  layers?: boolean
  /** Fica rodando depois das linhas (logs --follow) em vez de terminar. */
  follow?: boolean
  /** Termina com erro, com esta mensagem na última linha. */
  failWith?: string
  /** Chamado quando termina com sucesso (registrar a imagem baixada). */
  onDone?: () => void
}

function fakeStream(sink: StreamSink, opts: FakeStreamOptions): number {
  const id = allocStreamId()
  const ms = tickMs()
  const layers: ImageProgressLayer[] = opts.layers
    ? [
        { id: 'a1b2c3d4e5f6', status: 'downloading', current: 0, total: 6_000_000 },
        { id: 'f6e5d4c3b2a1', status: 'waiting', current: 0, total: 2_400_000 }
      ]
    : []

  let step = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const stop = (): void => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const advanceLayers = (): void => {
    // Camadas avançam em ritmos diferentes: a segunda só sai da espera depois
    // que a primeira termina, como num pull de verdade.
    const [first, second] = layers
    if (first.status !== 'complete') {
      first.current = Math.min(first.total, first.current + first.total / 2)
      if (first.current >= first.total) first.status = 'complete'
    } else if (second.status !== 'complete') {
      second.status = 'downloading'
      second.current = Math.min(second.total, second.current + second.total / 2)
      if (second.current >= second.total) second.status = 'complete'
    }
  }

  const finish = (code: number): void => {
    stop()
    releaseStream(id)
    sink.exit({ id, code })
  }

  timer = setInterval(() => {
    if (step < opts.lines.length) {
      sink.data({ id, chunk: `${opts.lines[step]}\n` })
      if (opts.layers) {
        advanceLayers()
        // Snapshot: o sink serializa o array para o renderer.
        sink.progress?.({ id, layers: structuredClone(layers) })
      }
      step++
      return
    }
    if (opts.failWith) {
      sink.data({ id, chunk: `${opts.failWith}\n` })
      finish(1)
      return
    }
    // logs --follow: continua vivo até o usuário parar (exercita streams:stop).
    if (opts.follow) return
    opts.onDone?.()
    finish(0)
  }, ms)

  registerStream(id, {
    kill: () => {
      stop()
      releaseStream(id)
      sink.exit({ id, code: null })
    }
  })
  return id
}

/** Saída plausível para um comando digitado no terminal embutido. */
function fakeShellOutput(line: string): string {
  const cmd = line.trim()
  if (cmd === '') return ''
  if (cmd === 'whoami') return 'root'
  if (cmd === 'pwd') return '/'
  if (cmd.startsWith('ls')) return 'bin  dev  etc  home  proc  root  sys  tmp  usr  var'
  if (cmd.startsWith('echo ')) return cmd.slice(5)
  if (cmd === 'uname -a') return 'Linux mock-container 6.6.87 #1 SMP x86_64 GNU/Linux'
  return `sh: ${cmd.split(' ')[0]}: not found`
}

function fakeTerminal(label: string, sink: TerminalSink): number {
  const id = allocTerminalId()
  const ms = tickMs()
  setTimeout(() => sink.data({ id, chunk: `Conectado a ${label} (demo)\r\n# ` }), ms)
  registerTerminal(id, {
    write: (line) => {
      const out = fakeShellOutput(line)
      setTimeout(() => sink.data({ id, chunk: `${out ? `${out}\r\n` : ''}# ` }), ms)
    },
    close: () => {
      releaseTerminal(id)
      sink.exit({ id, code: 0 })
    }
  })
  return id
}

// ————————————————————————————————————————————————— sessão nativa fictícia

interface NativeWorld {
  active: boolean
  containers: ContainerInfo[]
  images: ImageInfo[]
  volumes: VolumeInfo[]
  tuning: NativeTuning
  credentials: Set<string>
  nextId: number
}

/**
 * O storage da sessão nativa sobrevive ao reinício (as imagens ficam) e é
 * apagado no reset — igual ao real.
 */
function freshImages(): ImageInfo[] {
  return [
    { repository: 'alpine', tag: 'latest', id: 'sha256nat0001', created: 'há 1 dia', size: '5.6 MB' },
    { repository: 'nginx', tag: 'latest', id: 'sha256nat0002', created: 'há 4 dias', size: '192 MB' }
  ]
}

function freshVolumes(): VolumeInfo[] {
  return [
    {
      name: 'dados-nativos',
      driver: 'vhd',
      mountpoint: '\\native-session\\volumes\\dados-nativos.vhdx',
      scope: 'session',
      sizeBytes: 1024 * 1024 * 1024
    }
  ]
}

const world: NativeWorld = {
  active: false,
  containers: [],
  images: freshImages(),
  volumes: freshVolumes(),
  tuning: {},
  credentials: new Set(),
  nextId: 1
}

let onEnded: (reason: NativeSessionEndedEvent['reason']) => void = () => {}
let onCrash: (ev: NativeCrashDumpEvent) => void = () => {}

/** DLL escolhida na aba Sistema; null = a "empacotada" do modo demonstração. */
let mockSdkPath: string | null = null

const findContainer = (id: string): ContainerInfo | undefined =>
  world.containers.find((c) => c.id === id || c.name === id)

async function ensureSession(): Promise<void> {
  if (world.active) return
  if (shouldFail('engine:native')) {
    throw new Error('(demo) A sessão nativa "WslcUi" já está aberta por outro processo.')
  }
  world.active = true
  logInfo('native', 'Sessão nativa "WslcUi" criada (demo)')
}

/** Uma imagem baixada/carregada aparece na lista da sessão nativa. */
function addNativeImage(ref: string): void {
  const idx = ref.lastIndexOf(':')
  const repository = idx > 0 ? ref.slice(0, idx) : ref
  const tag = idx > 0 ? ref.slice(idx + 1) : 'latest'
  if (!world.images.some((i) => i.repository === repository && i.tag === tag)) {
    world.images.unshift({
      repository,
      tag,
      id: `sha256nat${String(world.nextId++).padStart(4, '0')}`,
      created: 'agora',
      size: '64 MB'
    })
  }
}

const nativeOps: NativeOps = {
  ensureSession,
  isSessionActive: () => world.active,
  releaseSession: () => {
    world.active = false
  },
  resetSession: async () => {
    if (shouldFail('system:reset-native')) {
      return failure('system:reset-native', 'Falha ao resetar a sessão nativa.')
    }
    world.active = false
    world.containers = []
    world.images = freshImages()
    world.volumes = freshVolumes()
    return ok('Sessão nativa resetada — containers, registros e imagens da sessão foram apagados.')
  },
  restartSession: async () => {
    if (shouldFail('system:restart-native')) {
      return failure('system:restart-native', 'Falha ao reiniciar a sessão nativa.')
    }
    // Com a ABI 2.9.9 os containers NÃO se perdem: soltar a sessão os derruba
    // para exited, e o app os reabre por nome (WslcOpenContainer). As imagens
    // ficam, como sempre. Medido no SDK real.
    for (const c of world.containers) {
      Object.assign(c, { state: 'exited', status: 'Exited (0) agora' })
    }
    world.active = true
    return ok('Sessão nativa reiniciada com as novas configurações (as imagens foram mantidas).')
  },
  cleanupContainers: async () => {
    // Fechar o app não apaga mais nada na ABI 2.9.9 — os containers são
    // reabertos na execução seguinte.
  },
  setTuning: (tuning) => {
    world.tuning = tuning
  },
  setOnSessionEnded: (cb) => {
    onEnded = cb
  },
  setOnCrashDump: (cb) => {
    onCrash = cb
  },
  status: (): NativeStatus =>
    shouldFail('native:status')
      ? {
          available: false,
          dllPath: null,
          source: null,
          wslVersion: null,
          abi: null,
          sizeBytes: null,
          missingComponents: ['Virtual Machine Platform'],
          detail: '(demo) wslcsdk.dll não encontrada nesta máquina.'
        }
      : {
          available: true,
          dllPath: mockSdkPath ?? 'C:\\demo\\vendor\\wslcsdk\\win-x64\\wslcsdk.dll',
          source: mockSdkPath === null ? 'bundled' : 'custom',
          wslVersion: '0.9.0',
          abi: '2.9.9+',
          sizeBytes: 4_929_888,
          missingComponents: [],
          detail: '(demo) SDK simulado carregado; todos os componentes presentes.'
        },
  getSdkPath: () => mockSdkPath,
  setSdkPath: (path: string | null) => {
    mockSdkPath = path
  },
  // A sonda dublada lê o NOME do arquivo: um caminho com "2.9.3" devolve a ABI
  // antiga, e qualquer coisa que não termine em .dll é recusada. É o bastante
  // para o E2E exercitar escolher, recusar e voltar para a empacotada.
  probeSdk: (path: string): SdkProbe => {
    if (!path.toLowerCase().endsWith('.dll')) {
      return {
        path,
        ok: false,
        wslVersion: null,
        abi: null,
        sizeBytes: null,
        sha256: null,
        missingComponents: [],
        detail: '(demo) Não é uma wslcsdk.dll utilizável: assinatura não reconhecida.'
      }
    }
    const antiga = path.includes('2.9.3')
    return {
      path,
      ok: true,
      wslVersion: '0.9.0',
      abi: antiga ? '2.9.3' : '2.9.9+',
      sizeBytes: antiga ? 5_406_520 : 4_929_888,
      sha256: antiga
        ? 'a3881e7d239be9944a64868c323046aa0292d4806c289cb31c50c8df8d5dc68d'
        : '8d4d55d4283fb32a5909b57e78b576d01363d7b28bb9b2595115e80faf61db5b',
      missingComponents: [],
      detail: `(demo) DLL válida, ABI ${antiga ? '2.9.3' : '2.9.9+'}.`
    }
  },
  install: async (onProgress: (ev: InstallProgressEvent) => void) => {
    const ms = tickMs()
    const components = ['Virtual Machine Platform', 'Pacote WSL']
    for (const [i, component] of components.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- progresso sequencial, de propósito
      await new Promise((resolve) => setTimeout(resolve, ms))
      onProgress({ component, step: i + 1, total: components.length })
    }
    if (shouldFail('system:install-wslc')) {
      return failure('system:install-wslc', 'A instalação exige privilégios de administrador.')
    }
    markEnvironmentInstalled()
    return ok('Instalação concluída: Virtual Machine Platform, Pacote WSL.')
  },

  listContainers: async (all) => {
    if (shouldFail('containers:list')) failHard('containers:list', 'Não foi possível listar os containers.')
    await ensureSession()
    return all ? [...world.containers] : world.containers.filter((c) => c.state === 'running')
  },
  containerAction: async (action: ContainerAction, id) => {
    if (shouldFail('containers:action')) return failure('containers:action', `Falha ao ${action}.`)
    const c = findContainer(id)
    if (!c) return failure('containers:action', `container não encontrado: ${id}`)
    if (action === 'remove') world.containers.splice(world.containers.indexOf(c), 1)
    else if (action === 'stop') Object.assign(c, { state: 'exited', status: 'Exited (0) agora' })
    else Object.assign(c, { state: 'running', status: 'Up agora' })
    return ok()
  },
  pruneContainers: async () => {
    if (shouldFail('containers:prune')) return failure('containers:prune', 'Falha ao remover os parados.')
    world.containers = world.containers.filter((c) => c.state === 'running')
    return ok()
  },
  runContainer: async (opts: RunContainerOptions) => {
    if (shouldFail('containers:run')) return failure('containers:run', 'Falha ao criar o container.')
    await ensureSession()
    world.containers.unshift({
      id: `nat${String(world.nextId++).padStart(9, '0')}`,
      name: opts.name || `nativo-${world.containers.length + 1}`,
      image: opts.image,
      command: opts.command ?? '',
      created: 'agora',
      status: opts.detach ? 'Up agora' : 'Exited (0) agora',
      state: opts.detach ? 'running' : 'exited',
      ports: (opts.ports ?? []).map((p) => `0.0.0.0:${p.replace(':', '->')}/tcp`).join(', ')
    })
    return ok()
  },
  exec: async (id, command) => {
    if (shouldFail('containers:exec')) return failure('containers:exec', 'Falha ao executar o comando.')
    const c = findContainer(id)
    if (!c) return failure('containers:exec', `container não encontrado: ${id}`)
    // Gatilhos de demonstração dos eventos que só existem no motor nativo.
    if (command.trim() === 'crash') {
      onCrash({
        dumpPath: 'C:\\Users\\demo\\AppData\\Local\\temp\\wslc-crashes\\busybox.1234.dmp',
        processName: '/bin/busybox',
        pid: 1234,
        signal: 11,
        signalName: 'SIGSEGV',
        timestamp: Math.floor(Date.now() / 1000)
      })
      return ok('(demo) processo derrubado para gerar um crash dump\n')
    }
    if (command.trim() === 'end-session') {
      world.active = false
      onEnded('shutdown')
      return ok('(demo) sessão nativa encerrada por fora\n')
    }
    return ok(`(demo, motor nativo) ${command}\n${fakeShellOutput(command)}\n`)
  },
  inspectContainer: async (id) => {
    if (shouldFail('containers:inspect')) return failure('containers:inspect', 'Falha ao inspecionar.')
    const c = findContainer(id)
    if (!c) return failure('containers:inspect', `container não encontrado: ${id}`)
    return ok(
      JSON.stringify(
        [
          {
            Id: c.id,
            Name: `/${c.name}`,
            Image: c.image,
            Engine: 'wslcsdk (demo)',
            State: { Status: c.state, Running: c.state === 'running', ExitCode: 0 },
            Config: { Cmd: c.command.split(' ').filter(Boolean) },
            NetworkSettings: { Mode: 'BRIDGED' }
          }
        ],
        null,
        2
      )
    )
  },
  killContainer: async (id) => {
    if (shouldFail('containers:kill')) return failure('containers:kill', 'Falha ao encerrar o container.')
    const c = findContainer(id)
    if (!c) return failure('containers:kill', `container não encontrado: ${id}`)
    Object.assign(c, { state: 'exited', status: 'Exited (137) agora' })
    return ok()
  },
  streamLogs: (id, sink) =>
    fakeStream(sink, {
      lines: [
        `[nativo] anexado aos logs de ${id}`,
        '2026/09/01 12:00:01 servidor iniciado',
        '2026/09/01 12:00:02 pronto para receber conexões'
      ],
      follow: true,
      failWith: shouldFail('containers:logs') ? 'Erro: fluxo de logs interrompido.' : undefined
    }),
  openTerminal: async (id, sink) => {
    if (shouldFail('terminal:open')) throw new Error('(demo) Falha ao abrir o terminal no container.')
    const c = findContainer(id)
    if (!c) throw new Error(`(demo) container não encontrado: ${id}`)
    return fakeTerminal(c.name || c.id, sink)
  },

  listImages: async () => {
    if (shouldFail('images:list')) failHard('images:list', 'Não foi possível listar as imagens.')
    await ensureSession()
    return [...world.images]
  },
  removeImage: async (ref) => {
    if (shouldFail('images:remove')) return failure('images:remove', `Falha ao remover "${ref}".`)
    const idx = world.images.findIndex((i) => `${i.repository}:${i.tag}` === ref || i.id === ref)
    if (idx < 0) return failure('images:remove', `imagem não encontrada: ${ref}`)
    world.images.splice(idx, 1)
    return ok()
  },
  tagImage: async (source, target) => {
    if (shouldFail('images:tag')) return failure('images:tag', `Falha ao criar a tag "${target}".`)
    const img = world.images.find((i) => `${i.repository}:${i.tag}` === source || i.id === source)
    if (!img) return failure('images:tag', `imagem não encontrada: ${source}`)
    const idx = target.lastIndexOf(':')
    const repository = idx > 0 ? target.slice(0, idx) : target
    const tag = idx > 0 ? target.slice(idx + 1) : 'latest'
    world.images.push({ ...img, repository, tag })
    return ok()
  },
  pullImage: (ref, sink) =>
    fakeStream(sink, {
      lines: [`Baixando ${ref} pela sessão nativa…`, 'Extraindo camadas…', `Pull de ${ref} concluído.`],
      layers: true,
      failWith: shouldFail('images:pull') ? `Erro: falha ao baixar ${ref}.` : undefined,
      onDone: () => addNativeImage(ref)
    }),
  pushImage: (ref, sink) =>
    fakeStream(sink, {
      lines: [`Enviando ${ref}…`, 'Camadas enviadas.', `Push de ${ref} concluído.`],
      layers: true,
      failWith: shouldFail('images:push')
        ? `Erro: acesso negado ao registry (faça login antes de enviar ${ref}).`
        : undefined
    }),
  loadImage: (path, sink) =>
    fakeStream(sink, {
      lines: [`Carregando imagem de ${path}…`, 'Imagem carregada: demo-carregada:latest'],
      failWith: shouldFail('images:load') ? 'Erro: tarball inválido.' : undefined,
      onDone: () => addNativeImage('demo-carregada:latest')
    }),
  importImage: (path, ref, sink) =>
    fakeStream(sink, {
      lines: [`Importando rootfs de ${path}…`, `Imagem criada: ${ref}`],
      failWith: shouldFail('images:import') ? 'Erro: rootfs inválido.' : undefined,
      onDone: () => addNativeImage(ref)
    }),
  login: async (server, username, password) => {
    if (shouldFail('registry:login')) return failure('registry:login', 'Usuário ou senha inválidos.')
    if (!password) return failure('registry:login', 'Senha obrigatória.')
    world.credentials.add(server || 'index.docker.io')
    return ok(`Login em ${server || 'index.docker.io'} como ${username} OK.`)
  },
  logout: (server) => {
    if (shouldFail('registry:logout')) return failure('registry:logout', 'Falha ao sair do registry.')
    world.credentials.delete(server || 'index.docker.io')
    return ok(`Credenciais de ${server || 'index.docker.io'} descartadas.`)
  },

  listVolumes: async () => {
    if (shouldFail('volumes:list')) failHard('volumes:list', 'Não foi possível listar os volumes.')
    await ensureSession()
    return [...world.volumes]
  },
  createVolume: async (name, opts: VhdVolumeOptions) => {
    if (shouldFail('volumes:create')) return failure('volumes:create', `Falha ao criar o volume "${name}".`)
    if (world.volumes.some((v) => v.name === name)) {
      return failure('volumes:create', `volume já existe: ${name}`)
    }
    world.volumes.push({
      name,
      driver: 'vhd',
      mountpoint: `\\native-session\\volumes\\${name}.vhdx`,
      scope: 'session',
      sizeBytes: opts.sizeMb * 1024 * 1024
    })
    return ok()
  },
  deleteVolume: async (name) => {
    if (shouldFail('volumes:remove')) return failure('volumes:remove', `Falha ao remover "${name}".`)
    const idx = world.volumes.findIndex((v) => v.name === name)
    if (idx < 0) return failure('volumes:remove', `volume não encontrado: ${name}`)
    world.volumes.splice(idx, 1)
    return ok()
  },
  inspectVolume: async (name) => {
    if (shouldFail('volumes:inspect')) return failure('volumes:inspect', 'Falha ao inspecionar o volume.')
    const vol = world.volumes.find((v) => v.name === name)
    if (!vol) return failure('volumes:inspect', `volume não encontrado: ${name}`)
    return ok(
      JSON.stringify(
        {
          Name: vol.name,
          Path: vol.mountpoint,
          SizeBytes: vol.sizeBytes,
          Type: 'dynamic',
          Owner: { uid: 0, gid: 0 }
        },
        null,
        2
      )
    )
  }
}

// ————————————————————————————————————————————————— motor CLI: streams

/** Uma imagem baixada/carregada/construída aparece na lista do motor CLI. */
function addCliImage(ref: string): void {
  const idx = ref.lastIndexOf(':')
  currentMockWorld()?.addImage(idx > 0 ? ref.slice(0, idx) : ref, idx > 0 ? ref.slice(idx + 1) : 'latest')
}

const streamOps: StreamOps = {
  logs: (id, sink) =>
    fakeStream(sink, {
      lines: [
        `[cli] acompanhando os logs de ${id}`,
        '2026/09/01 12:00:01 servidor iniciado',
        '2026/09/01 12:00:02 pronto para receber conexões'
      ],
      follow: true,
      failWith: shouldFail('containers:logs') ? 'Erro: fluxo de logs interrompido.' : undefined
    }),
  pull: (ref, sink) =>
    fakeStream(sink, {
      lines: [`Baixando ${ref}…`, 'Extraindo camadas…', `Pull de ${ref} concluído.`],
      failWith: shouldFail('images:pull') ? `Erro: falha ao baixar ${ref}.` : undefined,
      onDone: () => addCliImage(ref)
    }),
  push: (ref, sink) =>
    fakeStream(sink, {
      lines: [`Enviando ${ref}…`, `Push de ${ref} concluído.`],
      failWith: shouldFail('images:push')
        ? `Erro: acesso negado ao registry (faça login antes de enviar ${ref}).`
        : undefined
    }),
  load: (path, sink) =>
    fakeStream(sink, {
      lines: [`Carregando imagem de ${path}…`, 'Imagem carregada: demo-carregada:latest'],
      failWith: shouldFail('images:load') ? 'Erro: tarball inválido.' : undefined,
      onDone: () => addCliImage('demo-carregada:latest')
    }),
  import: (path, ref, sink) =>
    fakeStream(sink, {
      lines: [`Importando rootfs de ${path}…`, `Imagem criada: ${ref}`],
      failWith: shouldFail('images:import') ? 'Erro: rootfs inválido.' : undefined,
      onDone: () => addCliImage(ref)
    }),
  build: (args, sink) => {
    const tag = args[args.indexOf('-t') + 1] ?? 'imagem'
    return fakeStream(sink, {
      lines: ['PASSO 1/3 — FROM alpine:latest', 'PASSO 2/3 — COPY . /app', `PASSO 3/3 — marcada ${tag}`],
      failWith: shouldFail('images:build') ? 'Erro: Containerfile não encontrado no contexto.' : undefined,
      onDone: () => addCliImage(tag)
    })
  },
  openTerminal: (id, sink) => {
    if (shouldFail('terminal:open')) throw new Error('(demo) Falha ao abrir o terminal no container.')
    return fakeTerminal(id, sink)
  }
}

// ————————————————————————————————————————————————— efeitos externos

/**
 * Nada de abrir janelas do Windows em modo demo: cada efeito vira uma entrada
 * de log, que é onde o app já mostra o que aconteceu (view Logs).
 */
const hostOps: HostOps = {
  openExternalTerminal: (id) => logInfo('terminal', `(demo) terminal externo pedido para ${id}`),
  openWslcSettings: () => logInfo('cli', '(demo) settings.yaml do wslc aberto no editor padrão'),
  openExternal: (url) => logInfo('app', `(demo) link aberto no navegador: ${url}`),
  openPath: (path) => logInfo('app', `(demo) pasta aberta: ${path}`),
  showItemInFolder: (path) => logInfo('app', `(demo) arquivo revelado no Explorer: ${path}`),
  pickDirectory: async () => pickedPath('C:\\demo\\projeto'),
  pickFile: async () => pickedPath('C:\\demo\\imagem.tar'),
  pickSave: async (_win, _title, defaultName) => pickedPath(`C:\\demo\\${defaultName}`),
  searchRegistry: async (query) => {
    if (shouldFail('images:search-registry')) throw new Error('(demo) Docker Hub respondeu 503')
    const results: RegistryImage[] = [
      {
        name: query,
        description: `Imagem oficial de ${query} (resultado de demonstração)`,
        stars: 9876,
        official: true
      },
      {
        name: `comunidade/${query}`,
        description: 'Variante mantida pela comunidade',
        stars: 42,
        official: false
      }
    ]
    return results
  }
}

export function createMockOps(): Ops {
  return {
    native: nativeOps,
    stream: streamOps,
    host: hostOps,
    update: createMockUpdateOps(app.getVersion())
  }
}
