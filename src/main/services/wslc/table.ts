/**
 * Faz o parse de tabelas no estilo docker (colunas separadas por 2+ espaços,
 * alinhadas com o cabeçalho). Nomes de coluna podem conter um espaço simples
 * ("CONTAINER ID", "IMAGE ID").
 */
export function parseTable(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const header = lines[0]
  const cols: { name: string; start: number }[] = []
  const re = /\S+(?: \S+)*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(header)) !== null) {
    cols.push({ name: m[0].trim().toUpperCase(), start: m.index })
  }
  if (cols.length === 0) return []
  return lines.slice(1).map((line) => {
    const row: Record<string, string> = {}
    cols.forEach((c, i) => {
      const end = i + 1 < cols.length ? cols[i + 1].start : line.length
      row[c.name] = line.slice(c.start, end).trim()
    })
    return row
  })
}

/** Busca o valor da primeira coluna existente, ignorando caixa. */
export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const upper = k.toUpperCase()
    if (row[upper] !== undefined) return row[upper]
  }
  return ''
}
