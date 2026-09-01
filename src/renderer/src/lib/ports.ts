/**
 * Extrai a primeira porta do host de uma string de portas do wslc/docker,
 * ex.: "0.0.0.0:8080->80/tcp, :::8080->80/tcp" → 8080.
 */
export function firstHostPort(ports: string): number | null {
  const withHost = ports.match(/(?:[\d.]+|\[[^\]]+\]|:{2}):(\d+)->/)
  if (withHost) return Number(withHost[1])
  const bare = ports.match(/(?:^|\s)(\d+)->/)
  return bare ? Number(bare[1]) : null
}
