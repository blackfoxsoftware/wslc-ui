import { describe, expect, it } from 'vitest'
import { formatBytes, formatUnixDate, mapNativeImage, splitImageRef } from './images'

describe('splitImageRef', () => {
  it('separa repo e tag', () => {
    expect(splitImageRef('alpine:latest')).toEqual({ repository: 'alpine', tag: 'latest' })
    expect(splitImageRef('bitnami/redis:7.4')).toEqual({ repository: 'bitnami/redis', tag: '7.4' })
  })

  it('não confunde porta de registry com tag', () => {
    expect(splitImageRef('localhost:5000/app')).toEqual({ repository: 'localhost:5000/app', tag: '' })
    expect(splitImageRef('localhost:5000/app:v1')).toEqual({
      repository: 'localhost:5000/app',
      tag: 'v1'
    })
  })

  it('sem tag devolve tag vazia', () => {
    expect(splitImageRef('alpine')).toEqual({ repository: 'alpine', tag: '' })
  })
})

describe('formatBytes', () => {
  it('formata no estilo docker (decimal, 3 dígitos significativos)', () => {
    expect(formatBytes(0)).toBe('0B')
    expect(formatBytes(999)).toBe('999B')
    expect(formatBytes(8_415_579)).toBe('8.42MB')
    expect(formatBytes(125_000_000)).toBe('125MB')
    expect(formatBytes(12_500_000_000)).toBe('12.5GB')
  })
})

describe('formatUnixDate', () => {
  it('formata dd/mm/aaaa hh:mm', () => {
    expect(formatUnixDate(1_781_568_089)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})

describe('mapNativeImage', () => {
  it('converte a WslcImageInfo decodificada para o shape da UI', () => {
    const sha = new Uint8Array(32)
    sha.set([0xd5, 0x29, 0xdd, 0x0c, 0x6e, 0x55, 0xaa, 0xbb])
    const mapped = mapNativeImage({
      name: 'alpine:latest',
      sha256: sha,
      sizeBytes: 8_415_579,
      createdUnixTime: 1_781_568_089
    })
    expect(mapped.repository).toBe('alpine')
    expect(mapped.tag).toBe('latest')
    expect(mapped.id).toBe('d529dd0c6e55')
    expect(mapped.size).toBe('8.42MB')
    expect(mapped.created).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})
