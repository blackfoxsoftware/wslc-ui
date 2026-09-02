import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '@shared/schemas'

const ok = (stdout = ''): CommandResult => ({ ok: true, code: 0, stdout, stderr: '' })
const fail = (stderr: string): CommandResult => ({ ok: false, code: 1, stdout: '', stderr })

const wslcMock = vi.fn(async (_args: string[], _timeoutMs?: number): Promise<CommandResult> => ok())

vi.mock('./cli', () => ({
  WSLC: 'wslc.exe',
  runCommand: vi.fn(async () => ok()),
  wslc: (args: string[], timeoutMs?: number) => wslcMock(args, timeoutMs)
}))

import {
  buildConnectNetworkArgs,
  buildContainerActionArgs,
  buildCopyArgs,
  buildCreateNetworkArgs,
  buildCreateVolumeArgs,
  buildExecArgs,
  realWslcService
} from './real'

/**
 * Capturas LITERAIS da wslc 2.9.9.0.
 *
 * O teste antigo de redes usava um array JSON escrito à mão — formato que esta
 * versão da CLI nunca devolveu. Foi por isso que a virada para NDJSON passou
 * batida aqui e só apareceu na tela de quem usa. Colar a saída de verdade é o
 * que faz a próxima mudança de formato quebrar um teste, e não o app.
 */
const CAPTURA = {
  networks:
    '{"CreatedAt":"2026-09-02 02:55:43.556721287 +0000 UTC","Driver":"bridge","ID":"d2a0fec3fd2a","IPv4":"true","IPv6":"false","Internal":"false","Labels":"","Name":"bridge","Scope":"local"}\n' +
    '{"CreatedAt":"2026-09-01 20:39:56.413613634 +0000 UTC","Driver":"bridge","ID":"b9bdfff57be5","IPv4":"true","IPv6":"false","Internal":"true","Labels":"app=loja","Name":"loja-backend","Scope":"local"}\n',
  containers:
    '{"CreatedAt":1788317948,"Id":"183a32a36704f42a73a31532d238ca8810d0dcd176afb0de681504995a4a29da","Image":"nginx:alpine","Name":"sonda-portas","Ports":[{"BindingAddress":"127.0.0.1","ContainerPort":80,"HostPort":8099,"Protocol":6},{"BindingAddress":"127.0.0.1","ContainerPort":53,"HostPort":9099,"Protocol":17}],"State":2,"StateChangedAt":1788317949}\n',
  stats:
    '{"BlockIO":"9.05 MiB / 0 B","CPUPerc":"0.00%","ID":"8797216b3d23ac4718a1232d4a43d8620ad28c92eeeaf688547910dd862aae4c","MemPerc":"0.29%","MemUsage":"23.29 MiB / 7.72 GiB","Name":"loja-web","NetIO":"1.93 KiB / 0 B","PIDs":17}\n',
  images:
    '{"Containers":"1","CreatedAt":"2026-08-19 17:10:57 -0300 BRT","CreatedSince":"13 dias atrás","Digest":"<none>","ID":"7bc5ba2f958a","Repository":"nginx","SharedSize":"N/A","Size":"62.8MB","Tag":"alpine","UniqueSize":"N/A"}\n',
  volumes:
    '{"Availability":"N/A","Driver":"vhd","Group":"N/A","Labels":"app=loja","Links":"N/A","Mountpoint":"/var/lib/docker/volumes/loja-vhd/_data","Name":"loja-vhd","Scope":"local","Size":"N/A","Status":"N/A"}\n',
  statsTablePtBr:
    'ID DO CONTÊINER   NOME       % DE CPU   LIMITE/USO DE MEM       MEM %   E/S DE REDE   E/S DE BLOCO   PIDS\n' +
    '851dee042ea5      loja-api   0.09%      2.02 MiB / 256.00 MiB   0.79%   822 B / 0 B   0 B / 0 B      2\n',
  containersTablePtBr:
    'ID DO CONTÊINER   NOME       IMAGEM         CRIADO          STATUS                 PORTAS\n' +
    '8797216b3d23      loja-web   nginx:alpine   6 horas atrás   exited 3 horas atrás   \n'
}

describe('realWslcService.containerAction', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('restart é emulado com stop + start (o wslc não tem restart)', async () => {
    await realWslcService.containerAction('restart', 'web')
    expect(wslcMock.mock.calls.map(([args]) => args)).toEqual([
      ['container', 'stop', 'web'],
      ['container', 'start', 'web']
    ])
  })

  it('restart aborta se o stop falhar', async () => {
    wslcMock.mockResolvedValueOnce(fail('não consegui parar'))
    const res = await realWslcService.containerAction('restart', 'web')
    expect(res.ok).toBe(false)
    expect(wslcMock).toHaveBeenCalledTimes(1)
  })

  it('remove usa container rm', async () => {
    await realWslcService.containerAction('remove', 'abc')
    expect(wslcMock).toHaveBeenCalledWith(['container', 'rm', 'abc'], undefined)
  })
})

describe('realWslcService.getStats', () => {
  beforeEach(() => {
    wslcMock.mockClear()
  })

  it('lê o NDJSON de `stats --format json`', async () => {
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.stats))
    const stats = await realWslcService.getStats()
    expect(wslcMock).toHaveBeenCalledWith(['stats', '--format', 'json'], 30_000)
    expect(stats).toEqual([
      {
        id: '8797216b3d23',
        name: 'loja-web',
        cpuPercent: 0,
        memUsage: '23.29 MiB / 7.72 GiB',
        memPercent: 0.29,
        netIO: '1.93 KiB / 0 B',
        blockIO: '9.05 MiB / 0 B'
      }
    ])
  })

  it('sem --format json cai na tabela — e nunca em --no-stream, que a CLI removeu', async () => {
    wslcMock.mockResolvedValueOnce(fail('opção não reconhecida: --format'))
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.statsTablePtBr))
    const stats = await realWslcService.getStats()
    expect(wslcMock.mock.calls.map(([args]) => args)).toEqual([['stats', '--format', 'json'], ['stats']])
    expect(stats).toEqual([
      {
        id: '851dee042ea5',
        name: 'loja-api',
        cpuPercent: 0.09,
        memUsage: '2.02 MiB / 256.00 MiB',
        memPercent: 0.79,
        netIO: '822 B / 0 B',
        blockIO: '0 B / 0 B'
      }
    ])
  })

  it('devolve [] quando nem json nem tabela respondem (melhor-esforço)', async () => {
    wslcMock.mockResolvedValue(fail('stats indisponível'))
    expect(await realWslcService.getStats()).toEqual([])
  })
})

describe('listagens em --format json (CLI 2.9.9)', () => {
  beforeEach(() => {
    wslcMock.mockClear()
  })

  it('containers: NDJSON, porta com endereço de bind e status com o tempo no estado', async () => {
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.containers))
    const [c] = await realWslcService.listContainers(true)
    expect(wslcMock).toHaveBeenCalledWith(['container', 'list', '--all', '--format', 'json'], undefined)
    expect(c.id).toBe('183a32a36704')
    expect(c.ports).toBe('127.0.0.1:8099->80/tcp, 127.0.0.1:9099->53/udp')
    expect(c.state).toBe('running')
    expect(c.status).toMatch(/^Em execução há /)
  })

  it('containers: sem --format json cai na tabela localizada', async () => {
    wslcMock.mockResolvedValueOnce(fail('opção desconhecida'))
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.containersTablePtBr))
    const [c] = await realWslcService.listContainers(false)
    expect(c).toMatchObject({ id: '8797216b3d23', name: 'loja-web', state: 'exited' })
  })

  it('imagens: usa o json em vez da tabela traduzida', async () => {
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.images))
    const [i] = await realWslcService.listImages()
    expect(wslcMock).toHaveBeenCalledWith(['image', 'list', '--format', 'json'], undefined)
    expect(i).toEqual({
      repository: 'nginx',
      tag: 'alpine',
      id: '7bc5ba2f958a',
      created: '13 dias atrás',
      size: '62.8MB'
    })
  })

  it('volumes: usa o json em vez da tabela traduzida', async () => {
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.volumes))
    const [v] = await realWslcService.listVolumes()
    expect(wslcMock).toHaveBeenCalledWith(['volume', 'list', '--format', 'json'], undefined)
    expect(v).toEqual({
      name: 'loja-vhd',
      driver: 'vhd',
      mountpoint: '/var/lib/docker/volumes/loja-vhd/_data',
      scope: 'local'
    })
  })
})

describe('volume create com driver vhd (CLI 2.9.9)', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('sem opções continua sendo o volume guest padrão', () => {
    expect(buildCreateVolumeArgs('dados')).toEqual(['volume', 'create', 'dados'])
  })

  it('sizeMb vira SizeBytes; fixed e owner só aparecem quando pedidos', () => {
    expect(buildCreateVolumeArgs('d', { sizeMb: 512, fixed: false })).toEqual([
      'volume',
      'create',
      '-d',
      'vhd',
      '-o',
      'SizeBytes=536870912',
      'd'
    ])
    expect(buildCreateVolumeArgs('d', { sizeMb: 100, fixed: true, owner: { uid: 1000, gid: 1000 } })).toEqual(
      [
        'volume',
        'create',
        '-d',
        'vhd',
        '-o',
        'SizeBytes=104857600',
        '-o',
        'Fixed=true',
        '-o',
        'Uid=1000',
        '-o',
        'Gid=1000',
        'd'
      ]
    )
  })

  it('createVolume repassa as opções para a CLI', async () => {
    await realWslcService.createVolume('cache', { sizeMb: 256, fixed: false })
    expect(wslcMock).toHaveBeenCalledWith(
      ['volume', 'create', '-d', 'vhd', '-o', 'SizeBytes=268435456', 'cache'],
      undefined
    )
  })

  it('labels entram com -l, antes do nome', () => {
    expect(buildCreateVolumeArgs('dados', undefined, ['app=site', ' ', 'env=dev'])).toEqual([
      'volume',
      'create',
      '-l',
      'app=site',
      '-l',
      'env=dev',
      'dados'
    ])
  })
})

/**
 * `container rm -f/-v` e `container stop -s/-t` chegaram na 2.9.8. Atenção ao
 * `-t` do stop: ele é `--time`, não `--timeout`, e conta segundos até o
 * SIGKILL.
 */
describe('opções das ações de container (CLI 2.9.8+)', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('sem opções, cada ação é o comando cru', () => {
    expect(buildContainerActionArgs('start', 'web')).toEqual(['container', 'start', 'web'])
    expect(buildContainerActionArgs('stop', 'web')).toEqual(['container', 'stop', 'web'])
    expect(buildContainerActionArgs('remove', 'web')).toEqual(['container', 'rm', 'web'])
  })

  it('stop leva sinal e espera; remove leva força e volumes anônimos', () => {
    expect(buildContainerActionArgs('stop', 'web', { signal: 'SIGINT', timeout: 30 })).toEqual([
      'container',
      'stop',
      '-s',
      'SIGINT',
      '-t',
      '30',
      'web'
    ])
    expect(buildContainerActionArgs('remove', 'web', { force: true, volumes: true })).toEqual([
      'container',
      'rm',
      '-f',
      '-v',
      'web'
    ])
  })

  it('restart é stop + start, e o sinal vale para o stop', async () => {
    await realWslcService.containerAction('restart', 'web', { signal: 'SIGINT' })
    expect(wslcMock.mock.calls.map(([args]) => args)).toEqual([
      ['container', 'stop', '-s', 'SIGINT', 'web'],
      ['container', 'start', 'web']
    ])
  })

  it('remove com força chega à CLI', async () => {
    await realWslcService.containerAction('remove', 'web', { force: true })
    expect(wslcMock).toHaveBeenCalledWith(['container', 'rm', '-f', 'web'], undefined)
  })
})

/**
 * `container cp` (2.9.8) é o único comando novo INTEIRO das duas versões — e
 * o que passou batido nas auditorias anteriores, por serem feitas contra uma
 * lista nossa em vez da árvore de `--help` da CLI.
 */
describe('container cp', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('o prefixo CONTAINER: fica no lado certo em cada sentido', () => {
    const base = { container: 'web', hostPath: 'C:\\app\\site.conf', containerPath: '/etc/nginx/site.conf' }
    expect(buildCopyArgs({ ...base, direction: 'to-container' })).toEqual([
      'container',
      'cp',
      'C:\\app\\site.conf',
      'web:/etc/nginx/site.conf'
    ])
    expect(buildCopyArgs({ ...base, direction: 'from-container' })).toEqual([
      'container',
      'cp',
      'web:/etc/nginx/site.conf',
      'C:\\app\\site.conf'
    ])
  })

  it('-a vem antes dos caminhos', () => {
    const args = buildCopyArgs({
      container: 'web',
      direction: 'to-container',
      hostPath: 'C:\\dados',
      containerPath: '/dados',
      archive: true
    })
    expect(args).toEqual(['container', 'cp', '-a', 'C:\\dados', 'web:/dados'])
  })

  it('copyFiles usa o timeout longo (é tar por baixo, como o export)', async () => {
    await realWslcService.copyFiles({
      container: 'web',
      direction: 'to-container',
      hostPath: 'C:\\dados',
      containerPath: '/dados'
    })
    expect(wslcMock).toHaveBeenCalledWith(['container', 'cp', 'C:\\dados', 'web:/dados'], 600_000)
  })
})

describe('exec com opções (CLI)', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('sem opções continua sendo o sh -c de sempre', () => {
    expect(buildExecArgs('web', 'ls /app')).toEqual(['exec', 'web', 'sh', '-c', 'ls /app'])
  })

  it('as opções vêm antes do container; o comando continua por último', () => {
    expect(
      buildExecArgs('web', 'env', {
        detach: true,
        user: '1000:1000',
        workdir: '/app',
        env: ['DEBUG=1', ' '],
        envFile: 'C:\\projeto\\.env'
      })
    ).toEqual([
      'exec',
      '-d',
      '-u',
      '1000:1000',
      '-w',
      '/app',
      '-e',
      'DEBUG=1',
      '--env-file',
      'C:\\projeto\\.env',
      'web',
      'sh',
      '-c',
      'env'
    ])
  })
})

describe('remoção de imagem e idempotência de volume/rede', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('image rm aceita -f e --no-prune', async () => {
    await realWslcService.removeImage('nginx:alpine')
    expect(wslcMock).toHaveBeenCalledWith(['image', 'rm', 'nginx:alpine'], undefined)
    await realWslcService.removeImage('nginx:alpine', { force: true, noPrune: true })
    expect(wslcMock).toHaveBeenCalledWith(['image', 'rm', '-f', '--no-prune', 'nginx:alpine'], undefined)
  })

  /**
   * O -f do `volume rm` e do `network rm` NÃO é remoção forçada: a ajuda da
   * CLI diz "Não gere erro se o volume não existir". Confundir os dois faria
   * a UI prometer uma força que não existe.
   */
  it('o -f de volume e rede é só idempotência', async () => {
    await realWslcService.removeVolume('cache', true)
    expect(wslcMock).toHaveBeenCalledWith(['volume', 'rm', '-f', 'cache'], undefined)
    await realWslcService.removeNetwork('backend', true)
    expect(wslcMock).toHaveBeenCalledWith(['network', 'remove', '-f', 'backend'], undefined)
    await realWslcService.removeVolume('cache')
    expect(wslcMock).toHaveBeenCalledWith(['volume', 'rm', 'cache'], undefined)
  })
})

describe('prune: nenhum aceita --force na CLI 2.9.9', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  /**
   * `--force` faz os quatro comandos falharem com "O nome da opção não foi
   * reconhecido", ou seja, a limpeza nem chega a rodar. E sem `--all` o prune
   * de imagens só apaga as pendentes e o de volumes só os anônimos — bem menos
   * do que os rótulos “sem uso” da UI prometem. Nenhum deles pede confirmação:
   * quem pergunta é a UI, antes de chamar.
   */
  it('cada prune usa exatamente as opções que a CLI aceita', async () => {
    await realWslcService.pruneContainers()
    await realWslcService.pruneImages()
    await realWslcService.pruneVolumes()
    await realWslcService.pruneNetworks()

    const chamadas = wslcMock.mock.calls.map(([args]) => args)
    expect(chamadas).toEqual([
      ['container', 'prune'],
      ['image', 'prune', '--all'],
      ['volume', 'prune', '--all'],
      ['network', 'prune']
    ])
    expect(chamadas.flat()).not.toContain('--force')
  })
})

describe('kill / export / logout / volume inspect', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('kill sem sinal e com sinal (-s)', async () => {
    await realWslcService.killContainer('web')
    expect(wslcMock).toHaveBeenCalledWith(['container', 'kill', 'web'], undefined)
    await realWslcService.killContainer('web', 'SIGINT')
    expect(wslcMock).toHaveBeenCalledWith(['container', 'kill', '-s', 'SIGINT', 'web'], undefined)
  })

  it('export usa -o <arquivo> e timeout longo (tar do filesystem)', async () => {
    await realWslcService.exportContainer('web', 'C:\\tmp\\web.tar')
    expect(wslcMock).toHaveBeenCalledWith(
      ['container', 'export', '-o', 'C:\\tmp\\web.tar', 'web'],
      10 * 60_000
    )
  })

  it('logout sem e com servidor', async () => {
    await realWslcService.logout('')
    expect(wslcMock).toHaveBeenCalledWith(['logout'], undefined)
    await realWslcService.logout(' reg.example.com ')
    expect(wslcMock).toHaveBeenCalledWith(['logout', 'reg.example.com'], undefined)
  })

  it('volume inspect passa o nome direto', async () => {
    await realWslcService.inspectVolume('dados')
    expect(wslcMock).toHaveBeenCalledWith(['volume', 'inspect', 'dados'], undefined)
  })
})

describe('redes (CLI)', () => {
  beforeEach(() => {
    wslcMock.mockClear()
    wslcMock.mockResolvedValue(ok())
  })

  it('list lê o NDJSON da 2.9.9, onde o campo é ID (era Id na 2.9.4)', async () => {
    wslcMock.mockResolvedValueOnce(ok(CAPTURA.networks))
    const nets = await realWslcService.listNetworks()
    expect(wslcMock).toHaveBeenCalledWith(['network', 'list', '--format', 'json'], undefined)
    expect(nets).toEqual([
      { id: 'd2a0fec3fd2a', name: 'bridge', driver: 'bridge' },
      { id: 'b9bdfff57be5', name: 'loja-backend', driver: 'bridge' }
    ])
  })

  it('list ainda entende o array com `Id` das CLIs anteriores', async () => {
    wslcMock.mockResolvedValueOnce(
      ok(JSON.stringify([{ Driver: 'bridge', Id: 'f5287a7617258fe8aee81d0c2735bff0', Name: 'backend' }]))
    )
    expect(await realWslcService.listNetworks()).toEqual([
      { id: 'f5287a761725', name: 'backend', driver: 'bridge' }
    ])
  })

  it('buildCreateNetworkArgs cobre todas as opções', () => {
    expect(
      buildCreateNetworkArgs({
        name: 'backend',
        driver: 'bridge',
        subnet: '172.20.0.0/16',
        gateway: '172.20.0.1',
        internal: true,
        labels: ['app=site', ' '],
        options: ['mtu=1400']
      })
    ).toEqual([
      'network',
      'create',
      '-d',
      'bridge',
      '--subnet',
      '172.20.0.0/16',
      '--gateway',
      '172.20.0.1',
      '--internal',
      '-l',
      'app=site',
      '-o',
      'mtu=1400',
      'backend'
    ])
    expect(buildCreateNetworkArgs({ name: 'simples' })).toEqual(['network', 'create', 'simples'])
  })

  it('--ip-range (2.9.8) entra depois do gateway', () => {
    expect(
      buildCreateNetworkArgs({ name: 'app', subnet: '172.20.0.0/16', ipRange: '172.20.10.0/24' })
    ).toEqual(['network', 'create', '--subnet', '172.20.0.0/16', '--ip-range', '172.20.10.0/24', 'app'])
  })

  /**
   * As cinco opções do connect chegaram na 2.9.8 (PR #41070). A regra 18 do
   * ROADMAP dizia que `network connect` não tinha alias — caiu aqui.
   */
  it('buildConnectNetworkArgs cobre as opções, com rede e container por último', () => {
    expect(
      buildConnectNetworkArgs({
        network: 'backend',
        container: 'web',
        aliases: ['api', ' '],
        ip: '172.20.0.10',
        links: ['db:postgres'],
        linkLocalIps: ['169.254.10.1'],
        driverOpts: ['com.docker.network.endpoint.exposedports=80']
      })
    ).toEqual([
      'network',
      'connect',
      '--network-alias',
      'api',
      '--ip',
      '172.20.0.10',
      '--link',
      'db:postgres',
      '--link-local-ip',
      '169.254.10.1',
      '--driver-opt',
      'com.docker.network.endpoint.exposedports=80',
      'backend',
      'web'
    ])
  })

  it('prune NÃO passa --force (o -f do network prune é --filter)', async () => {
    await realWslcService.pruneNetworks()
    expect(wslcMock).toHaveBeenCalledWith(['network', 'prune'], undefined)
  })

  it('connect e disconnect na ordem rede → container', async () => {
    await realWslcService.connectNetwork({ network: 'backend', container: 'web' })
    expect(wslcMock).toHaveBeenCalledWith(['network', 'connect', 'backend', 'web'], undefined)
    await realWslcService.disconnectNetwork('backend', 'web')
    expect(wslcMock).toHaveBeenCalledWith(['network', 'disconnect', 'backend', 'web'], undefined)
  })
})

describe('sessões e settings do wslc', () => {
  beforeEach(() => {
    wslcMock.mockClear()
  })

  it('listSessions parseia a tabela localizada', async () => {
    wslcMock.mockResolvedValueOnce(
      ok('Identificação   PID do Criador   Nome de Exibição\n29              8880             wslc-cli\n')
    )
    const sessions = await realWslcService.listSessions()
    expect(wslcMock).toHaveBeenCalledWith(['system', 'session', 'list'], undefined)
    expect(sessions).toEqual([{ id: '29', creatorPid: '8880', displayName: 'wslc-cli' }])
  })

  it('resetWslcSettings chama settings reset', async () => {
    wslcMock.mockResolvedValueOnce(ok())
    await realWslcService.resetWslcSettings()
    expect(wslcMock).toHaveBeenCalledWith(['settings', 'reset'], undefined)
  })
})
