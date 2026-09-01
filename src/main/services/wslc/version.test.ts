import { describe, expect, it } from 'vitest'
import { compareVersions, firstVersion, MIN_WSL_VERSION } from './version'

describe('firstVersion', () => {
  it('extrai a versão da saída do wsl --version', () => {
    expect(firstVersion('Versão do WSL: 2.7.12.0\nVersão do kernel: 6.6.87.2-1')).toBe('2.7.12.0')
  })

  it('extrai versões de 3 segmentos', () => {
    expect(firstVersion('wslc version 1.0.3')).toBe('1.0.3')
  })

  it('retorna null sem versão no texto', () => {
    expect(firstVersion('comando não encontrado')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compara numericamente segmento a segmento', () => {
    expect(compareVersions('2.9.3', '2.7.12')).toBeGreaterThan(0)
    expect(compareVersions('2.7.12', '2.9.3')).toBeLessThan(0)
    expect(compareVersions('2.9.3', '2.9.3')).toBe(0)
  })

  it('trata comprimentos diferentes como zeros à direita', () => {
    expect(compareVersions('2.9.3.0', '2.9.3')).toBe(0)
    expect(compareVersions('2.9.3.1', '2.9.3')).toBeGreaterThan(0)
  })

  it('a versão mínima do wslc é a documentada', () => {
    expect(MIN_WSL_VERSION).toBe('2.9.3')
  })
})
