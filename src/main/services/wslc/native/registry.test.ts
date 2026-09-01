import { afterAll, describe, expect, it } from 'vitest'
import { locateWslcSdk } from './locate'
import {
  clearRegistryCredentials,
  DEFAULT_REGISTRY,
  encodeRegistryAuth,
  loginNativeRegistry,
  logoutNativeRegistry,
  registryAuthFor,
  registryFromRef,
  storedRegistryAuthFor
} from './registry'
import { releaseNativeSession } from './session'

const decode = (b64: string): unknown => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))

describe('registryFromRef (regra do Docker)', () => {
  it('1º segmento com "." , ":" ou localhost é registry', () => {
    expect(registryFromRef('127.0.0.1:5000/app:latest')).toBe('127.0.0.1:5000')
    expect(registryFromRef('registry.example.com/team/app:v1')).toBe('registry.example.com')
    expect(registryFromRef('localhost/app')).toBe('localhost')
  })

  it('refs do Docker Hub caem no registry padrão', () => {
    expect(registryFromRef('alpine:latest')).toBe(DEFAULT_REGISTRY)
    expect(registryFromRef('library/alpine:latest')).toBe(DEFAULT_REGISTRY)
    expect(registryFromRef('usuario/app:v2')).toBe(DEFAULT_REGISTRY)
  })
})

describe('encodeRegistryAuth (blob X-Registry-Auth)', () => {
  it('sem credenciais vira "{}" (anônimo)', () => {
    expect(decode(encodeRegistryAuth('x', null))).toEqual({})
  })

  it('usuário/senha viram JSON com serveraddress', () => {
    const blob = encodeRegistryAuth('reg:5000', { username: 'u', password: 'p', identityToken: '' })
    expect(decode(blob)).toEqual({ username: 'u', password: 'p', serveraddress: 'reg:5000' })
  })

  it('identity token tem prioridade sobre usuário/senha', () => {
    const blob = encodeRegistryAuth('reg:5000', { username: 'u', password: 'p', identityToken: 'tok' })
    expect(decode(blob)).toEqual({ identitytoken: 'tok' })
  })
})

describe('registryAuthFor sem login', () => {
  it('push cai no anônimo e pull em null', () => {
    clearRegistryCredentials()
    expect(decode(registryAuthFor('alpine:latest'))).toEqual({})
    expect(storedRegistryAuthFor('alpine:latest')).toBeNull()
  })
})

describe('logoutNativeRegistry (memória, sem SDK)', () => {
  it('informa quando não havia login e nunca falha', () => {
    clearRegistryCredentials()
    const res = logoutNativeRegistry('')
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('Não havia login')
    expect(res.stdout).toContain(DEFAULT_REGISTRY)
    const custom = logoutNativeRegistry(' reg.example.com ')
    expect(custom.stdout).toContain('reg.example.com')
  })
})

// Integração real: WslcSessionAuthenticate contra o Docker Hub (exige rede).
describe.skipIf(locateWslcSdk() === null)('login nativo (integração real via FFI)', () => {
  afterAll(() => {
    clearRegistryCredentials()
    releaseNativeSession()
  }, 30_000)

  it('credenciais falsas no Docker Hub falham com mensagem legível', { timeout: 60_000 }, async () => {
    const res = await loginNativeRegistry('index.docker.io', 'wslcui-teste-bogus', 'senha-errada-xyz')
    expect(res.ok).toBe(false)
    expect(res.stderr.length).toBeGreaterThan(0)
    // Sem login guardado, o push continua anônimo.
    expect(storedRegistryAuthFor('wslcui-teste-bogus/app:latest')).toBeNull()
  })

  it('registry inalcançável falha sem travar', { timeout: 60_000 }, async () => {
    const res = await loginNativeRegistry('127.0.0.1:59999', 'dummy', 'dummy')
    expect(res.ok).toBe(false)
    expect(res.stderr.length).toBeGreaterThan(0)
  })
})
