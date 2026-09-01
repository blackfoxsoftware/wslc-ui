import { describe, expect, it } from 'vitest'
import { firstHostPort } from './ports'

describe('firstHostPort', () => {
  it('extrai a porta do host do formato docker padrão', () => {
    expect(firstHostPort('0.0.0.0:8080->80/tcp')).toBe(8080)
    expect(firstHostPort('0.0.0.0:8080->80/tcp, :::8080->80/tcp')).toBe(8080)
  })

  it('suporta IPv6 e formato sem IP', () => {
    expect(firstHostPort('[::]:5432->5432/tcp')).toBe(5432)
    expect(firstHostPort('3000->3000/tcp')).toBe(3000)
  })

  it('retorna null sem mapeamento publicado', () => {
    expect(firstHostPort('')).toBeNull()
    expect(firstHostPort('80/tcp')).toBeNull()
  })
})
