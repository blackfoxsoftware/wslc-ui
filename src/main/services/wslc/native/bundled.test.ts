import { describe, expect, it } from 'vitest'
import { BUNDLED_SDKS, bundledPath, compareVersions, pickBundledSdk } from './bundled'

describe('compareVersions', () => {
  it('compara campo a campo, numericamente', () => {
    expect(compareVersions('2.9.10', '2.9.9')).toBeGreaterThan(0)
    expect(compareVersions('2.9.3', '2.9.4')).toBeLessThan(0)
    expect(compareVersions('2.9.4', '2.9.4')).toBe(0)
    expect(compareVersions('2.10.0', '2.9.99')).toBeGreaterThan(0)
  })

  it('trata partes ausentes como zero', () => {
    expect(compareVersions('2.9', '2.9.0')).toBe(0)
    expect(compareVersions('3', '2.9.9')).toBeGreaterThan(0)
  })
})

describe('pickBundledSdk', () => {
  // A regra existe porque o SDK 2.9.9 dá segfault num WSL 2.9.4 — medido em
  // WslcGetSessionTerminationEvent. Nunca usar SDK mais novo que o WSL.
  it('não escolhe SDK mais novo que o WSL instalado', () => {
    expect(pickBundledSdk('2.9.4').version).toBe('2.9.3')
    expect(pickBundledSdk('2.9.8').version).toBe('2.9.3')
  })

  it('usa a mais nova quando o WSL alcança', () => {
    expect(pickBundledSdk('2.9.9').version).toBe('2.9.9')
    expect(pickBundledSdk('2.10.0').version).toBe('2.9.9')
    expect(pickBundledSdk('3.0.0').version).toBe('2.9.9')
  })

  // Errar para baixo custa recurso; errar para cima custa o processo.
  it('sem saber a versão do WSL, fica na mais antiga', () => {
    expect(pickBundledSdk(null).version).toBe('2.9.3')
  })

  it('WSL abaixo de todas ainda devolve a mais antiga', () => {
    expect(pickBundledSdk('2.9.0').version).toBe('2.9.3')
  })
})

describe('BUNDLED_SDKS', () => {
  it('está ordenada da mais antiga para a mais nova', () => {
    const versoes = BUNDLED_SDKS.map((s) => s.version)
    expect([...versoes].sort(compareVersions)).toEqual(versoes)
  })

  it('aponta para dentro de vendor/, por versão', () => {
    // Comparado por segmento: o separador é do sistema, e o que importa é a
    // pasta da versão estar no caminho.
    expect(bundledPath(BUNDLED_SDKS[0]!, 'raiz').split(/[\\/]/)).toEqual([
      'raiz',
      'vendor',
      'wslcsdk',
      'win-x64',
      '2.9.3',
      'wslcsdk.dll'
    ])
  })
})
