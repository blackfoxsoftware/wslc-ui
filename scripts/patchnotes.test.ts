import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compararVersoes, encontrarVersao, lerPatchnotes, notasMarkdown, type Versao } from './patchnotes'

const RAIZ = resolve(import.meta.dirname, '..')

/** Uma entrada mínima válida, para os testes só mexerem no que interessa. */
function entrada(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { versao: '1.0.0', data: '2026-01-02', mudancas: { adicionado: ['algo'] }, ...extra }
}

function problemas(bruto: unknown): string[] {
  const res = lerPatchnotes(bruto)
  return res.ok ? [] : res.problemas
}

describe('lerPatchnotes', () => {
  it('aceita uma entrada completa', () => {
    const res = lerPatchnotes({
      versoes: [entrada({ titulo: 'Resumo', mudancas: { corrigido: ['  espaço aparado  '] } })]
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.versoes).toEqual([
      { versao: '1.0.0', data: '2026-01-02', titulo: 'Resumo', mudancas: { corrigido: ['espaço aparado'] } }
    ])
  })

  it('exige a lista de versões na raiz', () => {
    expect(problemas([])).toEqual([expect.stringContaining('raiz')])
    expect(problemas({})).toEqual([expect.stringContaining('"versoes"')])
    expect(problemas({ versoes: [], extra: 1 })).toHaveLength(2)
  })

  it('recusa versão fora do semver', () => {
    expect(problemas({ versoes: [entrada({ versao: 'v1.0' })] })).toEqual([expect.stringContaining('semver')])
  })

  it('recusa data impossível, mesmo no formato certo', () => {
    expect(problemas({ versoes: [entrada({ data: '2026-02-31' })] })).toEqual([
      expect.stringContaining('data real')
    ])
  })

  // Uma categoria com erro de digitação é o pior caso: sem esta checagem, a
  // seção simplesmente não sairia nas notas e ninguém notaria.
  it('recusa categoria desconhecida', () => {
    const encontrados = problemas({ versoes: [entrada({ mudancas: { adicionados: ['x'] } })] })
    expect(encontrados).toEqual([
      expect.stringContaining('categoria desconhecida'),
      expect.stringContaining('nenhuma mudança listada')
    ])
  })

  it('recusa chave desconhecida na entrada', () => {
    expect(problemas({ versoes: [entrada({ autor: 'eu' })] })).toEqual([
      expect.stringContaining('chave desconhecida')
    ])
  })

  it('recusa versão sem nenhuma mudança', () => {
    expect(problemas({ versoes: [entrada({ mudancas: {} })] })).toEqual([
      expect.stringContaining('nenhuma mudança')
    ])
    expect(problemas({ versoes: [entrada({ mudancas: { adicionado: [] } })] })).toEqual([
      expect.stringContaining('nenhuma mudança')
    ])
  })

  it('recusa item vazio ou de várias linhas', () => {
    expect(problemas({ versoes: [entrada({ mudancas: { adicionado: ['ok', '  ', 'a\nb'] } })] })).toEqual([
      expect.stringContaining('[1]'),
      expect.stringContaining('[2]')
    ])
  })

  it('recusa versão repetida', () => {
    expect(problemas({ versoes: [entrada(), entrada()] })).toEqual([expect.stringContaining('repetida')])
  })

  it('exige a lista da mais nova para a mais antiga', () => {
    expect(problemas({ versoes: [entrada({ versao: '0.9.0' }), entrada({ versao: '1.0.0' })] })).toEqual([
      expect.stringContaining('fora de ordem')
    ])
    expect(problemas({ versoes: [entrada({ versao: '1.0.0' }), entrada({ versao: '0.9.0' })] })).toEqual([])
  })

  it('acumula todos os problemas em vez de parar no primeiro', () => {
    expect(problemas({ versoes: [entrada({ data: 'ontem', mudancas: { errado: ['x'] } })] })).toHaveLength(3)
  })
})

describe('compararVersoes', () => {
  it('ordena por major, minor e patch', () => {
    expect(compararVersoes('1.2.3', '1.2.4')).toBeLessThan(0)
    expect(compararVersoes('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compararVersoes('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compararVersoes('1.0.0', '1.0.0')).toBe(0)
  })

  it('põe o pré-lançamento antes da versão final', () => {
    expect(compararVersoes('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(compararVersoes('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0)
    expect(compararVersoes('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
  })
})

describe('notasMarkdown', () => {
  const v: Versao = {
    versao: '1.0.0',
    data: '2026-01-02',
    titulo: 'Resumo da versão',
    mudancas: { corrigido: ['um erro'], adicionado: ['uma tela', 'outra tela'] }
  }

  it('abre pelo título e agrupa nas categorias, na ordem canônica', () => {
    // A ordem sai de CATEGORIAS, não da ordem em que estão no JSON.
    expect(notasMarkdown(v)).toBe(
      [
        'Resumo da versão',
        '',
        '### Adicionado',
        '',
        '- uma tela',
        '- outra tela',
        '',
        '### Corrigido',
        '',
        '- um erro',
        ''
      ].join('\n')
    )
  })

  it('funciona sem título', () => {
    const { titulo: _titulo, ...semTitulo } = v
    expect(notasMarkdown(semTitulo).startsWith('### Adicionado')).toBe(true)
  })
})

// O arquivo de verdade: se ele quebrar, o release quebra, e é melhor descobrir
// aqui do que no push para a main.
describe('patchnotes.json do repositório', () => {
  const bruto: unknown = JSON.parse(readFileSync(join(RAIZ, 'patchnotes.json'), 'utf8'))
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { version: string }

  it('é válido', () => {
    const res = lerPatchnotes(bruto)
    expect(res.ok ? [] : res.problemas).toEqual([])
  })

  it('tem a entrada da versão do package.json', () => {
    const res = lerPatchnotes(bruto)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(encontrarVersao(res.versoes, pkg.version)?.versao).toBe(pkg.version)
  })
})
