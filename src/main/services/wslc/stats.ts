import type { ContainerStats } from '@shared/schemas'
import { parseTable, pick } from './table'

/** "12.34%" → 12.34 (tolerante a vírgula decimal e lixo). */
export function parsePercent(raw: string): number {
  const m = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : 0
}

/** Faz o parse da tabela do `wslc stats --no-stream`. */
export function parseStatsTable(text: string): ContainerStats[] {
  return parseTable(text).map((row) => ({
    id: pick(row, 'CONTAINER ID', 'CONTAINER', 'ID'),
    name: pick(row, 'NAME', 'NAMES'),
    cpuPercent: parsePercent(pick(row, 'CPU %', 'CPU')),
    memUsage: pick(row, 'MEM USAGE / LIMIT', 'MEM USAGE'),
    memPercent: parsePercent(pick(row, 'MEM %', 'MEM')),
    netIO: pick(row, 'NET I/O', 'NET IO'),
    blockIO: pick(row, 'BLOCK I/O', 'BLOCK IO')
  }))
}
