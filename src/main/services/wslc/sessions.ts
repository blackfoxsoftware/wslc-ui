import type { WslcSessionInfo } from '@shared/schemas'

/**
 * Parser do `wslc system session list`. A tabela tem cabeçalhos LOCALIZADOS
 * ("Identificação   PID do Criador   Nome de Exibição") e não há --format
 * json — mas id e PID são sempre numéricos, então as linhas de dados são
 * reconhecidas pelo formato, não pelo cabeçalho. Linhas "[wslc] ..." (modo
 * --verbose) são ignoradas.
 */
export function parseSessionTable(stdout: string): WslcSessionInfo[] {
  const rows: WslcSessionInfo[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s{2,}(\d+)\s{2,}(.+)$/)
    if (!m) continue
    rows.push({ id: m[1], creatorPid: m[2], displayName: m[3].trim() })
  }
  return rows
}
