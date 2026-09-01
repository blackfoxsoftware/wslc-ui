/** Versão mínima do WSL que inclui o wslc (preview público). */
export const MIN_WSL_VERSION = '2.9.3'

/** Extrai a primeira versão "x.y.z" ou "x.y.z.w" de um texto. */
export function firstVersion(text: string): string | null {
  const m = text.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/)
  return m ? m[1] : null
}

/** Compara versões numéricas segmento a segmento (retorno < 0, 0 ou > 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
