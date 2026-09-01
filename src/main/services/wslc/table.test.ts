import { describe, expect, it } from 'vitest'
import { parseTable, pick } from './table'

/** Monta linhas alinhadas por colunas de largura fixa, como a saída do docker/wslc. */
function line(cells: string[], widths: number[]): string {
  return cells
    .map((c, i) => c.padEnd(widths[i]))
    .join('')
    .trimEnd()
}

describe('parseTable', () => {
  const widths = [15, 15, 25, 15, 28, 23, 10]

  it('faz o parse de uma tabela estilo docker com cabeçalhos de duas palavras', () => {
    const text = [
      line(['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], widths),
      line(
        [
          'a1b2c3d4e5f6',
          'nginx:latest',
          '"nginx -g daemon"',
          '2 hours ago',
          'Up 2 hours',
          '0.0.0.0:8080->80/tcp',
          'web'
        ],
        widths
      ),
      line(['f6e5d4c3b2a1', 'postgres', 'postgres', 'yesterday', 'Exited (0) 3 hours ago', '', 'db'], widths)
    ].join('\n')

    const rows = parseTable(text)
    expect(rows).toHaveLength(2)
    expect(rows[0]['CONTAINER ID']).toBe('a1b2c3d4e5f6')
    expect(rows[0]['NAMES']).toBe('web')
    expect(rows[1]['STATUS']).toBe('Exited (0) 3 hours ago')
    expect(rows[1]['PORTS']).toBe('')
  })

  it('a última coluna consome o resto da linha', () => {
    const w = [12, 10]
    const text = [
      line(['NAME', 'MOUNTPOINT'], w),
      line(['pgdata', '/var/lib/wslc/volumes/pgdata longo'], w)
    ].join('\n')
    const rows = parseTable(text)
    expect(rows[0]['MOUNTPOINT']).toBe('/var/lib/wslc/volumes/pgdata longo')
  })

  it('ignora linhas em branco e retorna [] sem linhas de dados', () => {
    expect(parseTable('')).toEqual([])
    expect(parseTable('REPOSITORY   TAG\n')).toEqual([])
    expect(parseTable('\n\n')).toEqual([])
  })

  it('normaliza os nomes de coluna para maiúsculas', () => {
    const w = [14, 8]
    const text = [line(['Repository', 'Tag'], w), line(['alpine', 'latest'], w)].join('\n')
    const rows = parseTable(text)
    expect(rows[0]['REPOSITORY']).toBe('alpine')
    expect(rows[0]['TAG']).toBe('latest')
  })
})

describe('pick', () => {
  it('busca a primeira coluna existente, ignorando caixa', () => {
    const row = { 'CONTAINER ID': 'abc', NAMES: 'web' }
    expect(pick(row, 'container id')).toBe('abc')
    expect(pick(row, 'ID', 'CONTAINER ID')).toBe('abc')
    expect(pick(row, 'NAME', 'NAMES')).toBe('web')
    expect(pick(row, 'PORTS')).toBe('')
  })
})
