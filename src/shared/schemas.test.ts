import { describe, expect, it } from 'vitest'
import {
  commandResultSchema,
  containerSchema,
  environmentSchema,
  runContainerOptionsSchema,
  streamDataEventSchema,
  streamExitEventSchema
} from './schemas'

describe('schemas de domínio', () => {
  it('aceita um container válido', () => {
    const parsed = containerSchema.parse({
      id: 'a1b2c3',
      name: 'web',
      image: 'nginx:latest',
      command: 'nginx',
      created: 'agora',
      status: 'Up 2 hours',
      state: 'running',
      ports: '0.0.0.0:8080->80/tcp'
    })
    expect(parsed.state).toBe('running')
  })

  it('rejeita state desconhecido', () => {
    const res = containerSchema.safeParse({
      id: 'x',
      name: 'x',
      image: 'x',
      command: '',
      created: '',
      status: '',
      state: 'zumbi',
      ports: ''
    })
    expect(res.success).toBe(false)
  })

  it('commandResult aceita code null (processo morto por timeout)', () => {
    const parsed = commandResultSchema.parse({ ok: false, code: null, stdout: '', stderr: 'timeout' })
    expect(parsed.code).toBeNull()
  })

  it('runContainerOptions exige imagem não vazia', () => {
    expect(runContainerOptionsSchema.safeParse({ image: '', detach: true, rm: false }).success).toBe(false)
    expect(
      runContainerOptionsSchema.safeParse({ image: 'alpine:latest', detach: true, rm: false }).success
    ).toBe(true)
  })

  it('runContainerOptions aceita campos opcionais ausentes', () => {
    const parsed = runContainerOptionsSchema.parse({ image: 'alpine', detach: false, rm: true })
    expect(parsed.ports).toBeUndefined()
    expect(parsed.gpus).toBeUndefined()
  })

  it('environment valida a forma completa', () => {
    const res = environmentSchema.safeParse({
      wslInstalled: true,
      wslVersion: '2.9.3.0',
      wslVersionOk: true,
      wslcAvailable: true,
      wslcVersion: 'mock',
      ready: true
    })
    expect(res.success).toBe(true)
  })

  it('eventos de stream validam id e chunk/code', () => {
    expect(streamDataEventSchema.safeParse({ id: 1, chunk: 'olá' }).success).toBe(true)
    expect(streamDataEventSchema.safeParse({ id: 'x', chunk: 'olá' }).success).toBe(false)
    expect(streamExitEventSchema.safeParse({ id: 2, code: null }).success).toBe(true)
    expect(streamExitEventSchema.safeParse({ id: 2, code: 1.5 }).success).toBe(false)
  })
})
