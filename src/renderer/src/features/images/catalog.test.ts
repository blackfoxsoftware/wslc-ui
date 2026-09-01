import { describe, expect, it } from 'vitest'
import { CATEGORIES, catalogEntry, IMAGE_CATALOG } from './catalog'

describe('IMAGE_CATALOG', () => {
  it('é um catálogo parrudo (60+ imagens)', () => {
    expect(IMAGE_CATALOG.length).toBeGreaterThanOrEqual(60)
  })

  it('não tem referências duplicadas', () => {
    const refs = IMAGE_CATALOG.map((i) => i.ref)
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('toda entrada tem categoria válida e campos preenchidos', () => {
    for (const item of IMAGE_CATALOG) {
      expect(CATEGORIES).toContain(item.category)
      expect(item.ref.length).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.description.length).toBeGreaterThan(0)
    }
  })

  it('toda categoria tem pelo menos uma imagem', () => {
    for (const category of CATEGORIES) {
      expect(IMAGE_CATALOG.some((i) => i.category === category)).toBe(true)
    }
  })

  it('sugestões de portas e env têm formato válido', () => {
    for (const item of IMAGE_CATALOG) {
      for (const port of item.ports ?? []) {
        expect(port).toMatch(/^\d+:\d+$/)
      }
      for (const env of item.env ?? []) {
        expect(env).toMatch(/^[^=]+=.+$/)
      }
    }
  })

  it('catalogEntry busca por referência exata', () => {
    expect(catalogEntry('postgres:latest')?.name).toBe('PostgreSQL')
    expect(catalogEntry('nao-existe')).toBeUndefined()
  })
})
