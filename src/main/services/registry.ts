import { z } from 'zod'
import type { RegistryImage } from '@shared/schemas'

/**
 * Busca pública do Docker Hub. Roda no processo main (o renderer tem CSP
 * restrita a 'self'), com timeout e validação da resposta externa.
 */

const hubResultSchema = z.object({
  repo_name: z.string(),
  short_description: z.string().nullish(),
  star_count: z.number().nullish(),
  is_official: z.boolean().nullish()
})

const hubResponseSchema = z.object({
  results: z.array(hubResultSchema).default([])
})

export type HubResult = z.infer<typeof hubResultSchema>

/** Converte um resultado do Hub para o formato do app. */
export function mapHubResult(result: HubResult): RegistryImage {
  return {
    name: result.repo_name,
    description: result.short_description ?? '',
    stars: result.star_count ?? 0,
    official: result.is_official ?? false
  }
}

export async function searchDockerHub(query: string, timeoutMs = 10_000): Promise<RegistryImage[]> {
  const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=25`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Docker Hub respondeu ${res.status}`)
  const parsed = hubResponseSchema.parse(await res.json())
  return parsed.results.map(mapHubResult)
}
