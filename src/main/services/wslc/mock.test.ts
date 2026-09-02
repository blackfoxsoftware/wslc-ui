import { describe, expect, it } from 'vitest'
import { createMockWslcService } from './mock'
import { resolveWslcService } from './index'
import { realWslcService } from './real'

describe('createMockWslcService', () => {
  it('cada instância tem estado independente', async () => {
    const a = createMockWslcService()
    const b = createMockWslcService()
    await a.runContainer({ image: 'alpine:latest', detach: true, rm: false })
    expect(await a.listContainers(true)).toHaveLength(3)
    expect(await b.listContainers(true)).toHaveLength(2)
  })

  it('listContainers(false) filtra os parados', async () => {
    const svc = createMockWslcService()
    const running = await svc.listContainers(false)
    expect(running.every((c) => c.state === 'running')).toBe(true)
  })

  it('runContainer adiciona no topo com nome e imagem', async () => {
    const svc = createMockWslcService()
    const res = await svc.runContainer({ image: 'alpine:latest', name: 'teste', detach: true, rm: false })
    expect(res.ok).toBe(true)
    const [first] = await svc.listContainers(true)
    expect(first.name).toBe('teste')
    expect(first.image).toBe('alpine:latest')
    expect(first.state).toBe('running')
  })

  it('stop/start/remove mudam o estado', async () => {
    const svc = createMockWslcService()
    await svc.containerAction('stop', 'web')
    expect((await svc.listContainers(true)).find((c) => c.name === 'web')?.state).toBe('exited')
    await svc.containerAction('start', 'web')
    expect((await svc.listContainers(true)).find((c) => c.name === 'web')?.state).toBe('running')
    await svc.containerAction('remove', 'db')
    expect((await svc.listContainers(true)).some((c) => c.name === 'db')).toBe(false)
  })

  it('ação em container inexistente falha sem lançar', async () => {
    const svc = createMockWslcService()
    const res = await svc.containerAction('stop', 'fantasma')
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('fantasma')
  })

  it('pruneContainers remove apenas os não-running', async () => {
    const svc = createMockWslcService()
    await svc.pruneContainers()
    const rest = await svc.listContainers(true)
    expect(rest.every((c) => c.state === 'running')).toBe(true)
  })

  it('createVolume rejeita duplicado e removeVolume apaga', async () => {
    const svc = createMockWslcService()
    expect((await svc.createVolume('pgdata')).ok).toBe(false)
    expect((await svc.createVolume('novo')).ok).toBe(true)
    expect((await svc.listVolumes()).some((v) => v.name === 'novo')).toBe(true)
    await svc.removeVolume('novo')
    expect((await svc.listVolumes()).some((v) => v.name === 'novo')).toBe(false)
  })

  it('removeImage apaga pela referência repo:tag', async () => {
    const svc = createMockWslcService()
    await svc.removeImage('alpine:latest')
    expect((await svc.listImages()).some((i) => i.repository === 'alpine')).toBe(false)
  })

  it('redes: criar rejeita duplicado, remover apaga e connect valida os dois lados', async () => {
    const svc = createMockWslcService()
    expect((await svc.createNetwork({ name: 'frontend' })).ok).toBe(false)
    expect((await svc.createNetwork({ name: 'backend' })).ok).toBe(true)
    expect((await svc.listNetworks()).some((n) => n.name === 'backend')).toBe(true)
    expect((await svc.connectNetwork({ network: 'backend', container: 'web' })).ok).toBe(true)
    expect((await svc.connectNetwork({ network: 'fantasma', container: 'web' })).ok).toBe(false)
    expect((await svc.connectNetwork({ network: 'backend', container: 'fantasma' })).ok).toBe(false)
    expect((await svc.removeNetwork('backend')).ok).toBe(true)
    expect((await svc.listNetworks()).some((n) => n.name === 'backend')).toBe(false)
  })

  /**
   * O dublê segue as MESMAS regras da CLI 2.9.9 nestes dois pontos, senão o
   * caminho de "forçar" da UI só existiria contra a máquina de verdade.
   */
  it('remover container em execução exige força; imagem em uso também', async () => {
    const svc = createMockWslcService()

    const semForca = await svc.containerAction('remove', 'web')
    expect(semForca.ok).toBe(false)
    expect(semForca.stderr).toContain('em execução')
    expect((await svc.listContainers(true)).some((c) => c.name === 'web')).toBe(true)

    // nginx:latest é a imagem do container "web", que ainda está de pé.
    expect((await svc.removeImage('nginx:latest')).ok).toBe(false)
    expect((await svc.removeImage('nginx:latest', { force: true })).ok).toBe(true)

    expect((await svc.containerAction('remove', 'web', { force: true })).ok).toBe(true)
    expect((await svc.listContainers(true)).some((c) => c.name === 'web')).toBe(false)
  })

  it('o -f de volume e rede é idempotência, não força', async () => {
    const svc = createMockWslcService()
    expect((await svc.removeVolume('fantasma')).ok).toBe(false)
    expect((await svc.removeVolume('fantasma', true)).ok).toBe(true)
    expect((await svc.removeNetwork('fantasma')).ok).toBe(false)
    expect((await svc.removeNetwork('fantasma', true)).ok).toBe(true)
  })

  it('copyFiles valida o container e descreve o sentido da cópia', async () => {
    const svc = createMockWslcService()
    const res = await svc.copyFiles({
      container: 'web',
      direction: 'from-container',
      hostPath: 'C:\\saida',
      containerPath: '/etc/nginx'
    })
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('web:/etc/nginx → C:\\saida')
    expect(
      (
        await svc.copyFiles({
          container: 'fantasma',
          direction: 'to-container',
          hostPath: 'C:\\x',
          containerPath: '/x'
        })
      ).ok
    ).toBe(false)
  })

  it('kill marca o container como exited e export/logout respondem ok', async () => {
    const svc = createMockWslcService()
    expect((await svc.killContainer('web')).ok).toBe(true)
    expect((await svc.listContainers(true)).find((c) => c.name === 'web')?.state).toBe('exited')
    expect((await svc.exportContainer('web', 'C:\\x.tar')).ok).toBe(true)
    expect((await svc.exportContainer('fantasma', 'C:\\x.tar')).ok).toBe(false)
    expect((await svc.logout('')).ok).toBe(true)
    expect((await svc.listSessions()).length).toBeGreaterThan(0)
    expect((await svc.inspectVolume('pgdata')).ok).toBe(true)
    expect((await svc.inspectNetwork('frontend')).ok).toBe(true)
  })
})

describe('resolveWslcService', () => {
  it('usa o mock quando WSLC_UI_MOCK=1', async () => {
    const svc = resolveWslcService({ WSLC_UI_MOCK: '1' } as NodeJS.ProcessEnv)
    expect((await svc.getEnvironment()).wslcVersion).toBe('mock')
  })

  it('usa o serviço real por padrão', () => {
    expect(resolveWslcService({} as NodeJS.ProcessEnv)).toBe(realWslcService)
  })
})
