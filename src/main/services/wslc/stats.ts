import type { ContainerStats } from '@shared/schemas'
import { parseTable, pick } from './table'

/** "12.34%" → 12.34 (tolerante a vírgula decimal e lixo). */
export function parsePercent(raw: string): number {
  const m = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : 0
}

/**
 * Faz o parse da tabela do `wslc stats` (fallback do --format json).
 *
 * Os cabeçalhos são traduzidos — em pt-BR a tabela vem como
 * "ID DO CONTÊINER / NOME / % DE CPU / LIMITE/USO DE MEM / MEM % / E/S DE
 * REDE / E/S DE BLOCO / PIDS" —, então cada coluna lista os dois idiomas.
 */
export function parseStatsTable(text: string): ContainerStats[] {
  return parseTable(text).map((row) => ({
    id: pick(row, 'CONTAINER ID', 'ID DO CONTÊINER', 'CONTAINER', 'ID'),
    name: pick(row, 'NAME', 'NAMES', 'NOME'),
    cpuPercent: parsePercent(pick(row, 'CPU %', '% DE CPU', 'CPU')),
    memUsage: pick(row, 'MEM USAGE / LIMIT', 'LIMITE/USO DE MEM', 'MEM USAGE'),
    memPercent: parsePercent(pick(row, 'MEM %', 'MEM')),
    netIO: pick(row, 'NET I/O', 'E/S DE REDE', 'NET IO'),
    blockIO: pick(row, 'BLOCK I/O', 'E/S DE BLOCO', 'BLOCK IO')
  }))
}
