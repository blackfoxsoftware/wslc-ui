/** Formata bytes no estilo da CLI docker (base decimal, 3 dígitos significativos). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes}B`
  const units = ['kB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    if (value < 1000) break
    value /= 1000
    unit = next
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)}${unit}`
}
