import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapHubResult, searchDockerHub } from './registry'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapHubResult', () => {
  it('mapeia campos e preenche ausentes', () => {
    expect(
      mapHubResult({ repo_name: 'nginx', short_description: null, star_count: null, is_official: true })
    ).toEqual({ name: 'nginx', description: '', stars: 0, official: true })
  })
})

describe('searchDockerHub', () => {
  it('consulta o Hub com a query codificada e mapeia os resultados', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        results: [
          { repo_name: 'redis', short_description: 'Cache', star_count: 12000, is_official: true },
          { repo_name: 'bitnami/redis', short_description: null, star_count: 300, is_official: false }
        ]
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchDockerHub('redis cache')
    expect(fetchMock.mock.calls[0][0]).toContain('query=redis%20cache')
    expect(results).toEqual([
      { name: 'redis', description: 'Cache', stars: 12000, official: true },
      { name: 'bitnami/redis', description: '', stars: 300, official: false }
    ])
  })

  it('lança erro descritivo quando o Hub responde mal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    )
    await expect(searchDockerHub('x')).rejects.toThrow('Docker Hub respondeu 503')
  })
})
