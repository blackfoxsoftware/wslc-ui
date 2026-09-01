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

import { buildCreateNetworkArgs, realWslcService } from './real'

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

  it('usa stats --no-stream e devolve [] em falha (melhor-esforço)', async () => {
    wslcMock.mockResolvedValueOnce(fail('stats indisponível'))
    const stats = await realWslcService.getStats()
    expect(stats).toEqual([])
    expect(wslcMock).toHaveBeenCalledWith(['stats', '--no-stream'], 30_000)
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

  it('list usa --format json e encurta o id', async () => {
    wslcMock.mockResolvedValueOnce(
      ok(JSON.stringify([{ Driver: 'bridge', Id: 'f5287a7617258fe8aee81d0c2735bff0', Name: 'backend' }]))
    )
    const nets = await realWslcService.listNetworks()
    expect(wslcMock).toHaveBeenCalledWith(['network', 'list', '--format', 'json'], undefined)
    expect(nets).toEqual([{ id: 'f5287a761725', name: 'backend', driver: 'bridge' }])
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

  it('prune NÃO passa --force (o -f do network prune é --filter)', async () => {
    await realWslcService.pruneNetworks()
    expect(wslcMock).toHaveBeenCalledWith(['network', 'prune'], undefined)
  })

  it('connect e disconnect na ordem rede → container', async () => {
    await realWslcService.connectNetwork('backend', 'web')
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
