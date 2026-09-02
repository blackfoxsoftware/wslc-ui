import { describe, expect, it } from 'vitest'
import { buildRunArgs, splitCommand } from './run-args'

describe('splitCommand', () => {
  it('divide por espaços', () => {
    expect(splitCommand('nginx -g daemon')).toEqual(['nginx', '-g', 'daemon'])
  })

  it('respeita aspas duplas e simples', () => {
    expect(splitCommand('sh -c "echo olá mundo"')).toEqual(['sh', '-c', 'echo olá mundo'])
    expect(splitCommand("nginx -g 'daemon off;'")).toEqual(['nginx', '-g', 'daemon off;'])
  })
})

describe('buildRunArgs', () => {
  it('monta o mínimo: run + imagem', () => {
    expect(buildRunArgs({ image: 'alpine:latest', detach: false, rm: false })).toEqual([
      'run',
      'alpine:latest'
    ])
  })

  it('monta a linha completa na ordem esperada', () => {
    const args = buildRunArgs({
      image: 'nginx:latest',
      name: 'web',
      ports: ['8080:80'],
      env: ['TZ=Etc/UTC'],
      volumes: ['dados:/data'],
      detach: true,
      rm: true,
      gpus: true,
      command: 'nginx -g "daemon off;"'
    })
    expect(args).toEqual([
      'run',
      '-d',
      '--rm',
      '--name',
      'web',
      '-p',
      '8080:80',
      '-e',
      'TZ=Etc/UTC',
      '-v',
      'dados:/data',
      '--gpus',
      'all',
      'nginx:latest',
      'nginx',
      '-g',
      'daemon off;'
    ])
  })

  it('filtra entradas vazias e apara espaços', () => {
    const args = buildRunArgs({
      image: '  alpine  ',
      name: '   ',
      ports: ['', ' 3000:3000 '],
      env: [' '],
      detach: false,
      rm: false
    })
    expect(args).toEqual(['run', '-p', '3000:3000', 'alpine'])
  })

  it('cobre todos os flags estendidos do wslc run', () => {
    const args = buildRunArgs({
      image: 'nginx:latest',
      detach: false,
      rm: false,
      publishAll: true,
      envFile: 'C:\\proj\\.env',
      tmpfs: ['/cache'],
      hostname: 'web-01',
      domainname: 'interno.local',
      workdir: '/app',
      user: '1000:1000',
      entrypoint: '/bin/sh',
      network: 'backend',
      networkAliases: ['web', 'site'],
      dns: ['1.1.1.1'],
      dnsSearch: ['svc.local'],
      dnsOptions: ['ndots:2'],
      labels: ['app=site'],
      cpus: '1.5',
      memory: '512M',
      shmSize: '64M',
      ulimits: ['nofile=1024:2048'],
      stopSignal: 'SIGINT',
      stopTimeout: -1,
      health: { cmd: 'curl -f http://localhost/', interval: '30s', retries: 3, timeout: '5s' }
    })
    expect(args).toEqual([
      'run',
      '-P',
      '--env-file',
      'C:\\proj\\.env',
      '--tmpfs',
      '/cache',
      '--hostname',
      'web-01',
      '--domainname',
      'interno.local',
      '--workdir',
      '/app',
      '--user',
      '1000:1000',
      '--entrypoint',
      '/bin/sh',
      '--network',
      'backend',
      '--network-alias',
      'web',
      '--network-alias',
      'site',
      '--dns',
      '1.1.1.1',
      '--dns-search',
      'svc.local',
      '--dns-option',
      'ndots:2',
      '-l',
      'app=site',
      '--cpus',
      '1.5',
      '--memory',
      '512M',
      '--shm-size',
      '64M',
      '--ulimit',
      'nofile=1024:2048',
      '--stop-signal',
      'SIGINT',
      '--stop-timeout',
      '-1',
      '--health-cmd',
      'curl -f http://localhost/',
      '--health-interval',
      '30s',
      '--health-retries',
      '3',
      '--health-timeout',
      '5s',
      'nginx:latest'
    ])
  })

  it('healthcheck desativado vira --no-healthcheck e ignora os outros campos', () => {
    const args = buildRunArgs({
      image: 'alpine',
      detach: false,
      rm: false,
      health: { disable: true, cmd: 'ignorado' }
    })
    expect(args).toEqual(['run', '--no-healthcheck', 'alpine'])
  })

  it('--ip e --mount acompanham a rede escolhida', () => {
    const args = buildRunArgs({
      image: 'nginx',
      detach: false,
      rm: false,
      network: 'backend',
      ip: '172.20.0.10',
      mounts: ['type=bind,source=C:\\projeto,target=/app,readonly', '  ']
    })
    expect(args).toEqual([
      'run',
      '--network',
      'backend',
      '--ip',
      '172.20.0.10',
      '--mount',
      'type=bind,source=C:\\projeto,target=/app,readonly',
      'nginx'
    ])
  })

  it('--pull só aparece quando muda o padrão da CLI (missing)', () => {
    expect(buildRunArgs({ image: 'nginx', detach: false, rm: false, pull: 'missing' })).toEqual([
      'run',
      'nginx'
    ])
    expect(buildRunArgs({ image: 'nginx', detach: false, rm: false, pull: 'always' })).toEqual([
      'run',
      '--pull',
      'always',
      'nginx'
    ])
  })

  /**
   * `container create` prepara o container parado — é o fluxo do docker para
   * quem quer configurar agora e iniciar depois. Ele não aceita -d: não há o
   * que desanexar num container que nem começou.
   */
  it('createOnly troca `run` por `container create` e derruba o -d', () => {
    const args = buildRunArgs({
      image: 'nginx',
      name: 'web',
      detach: true,
      rm: false,
      createOnly: true
    })
    expect(args).toEqual(['container', 'create', '--name', 'web', 'nginx'])
  })
})
