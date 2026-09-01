import { describe, expect, it } from 'vitest'
import { parsePercent, parseStatsTable } from './stats'

function line(cells: string[], widths: number[]): string {
  return cells
    .map((c, i) => c.padEnd(widths[i]))
    .join('')
    .trimEnd()
}

describe('parsePercent', () => {
  it('extrai o número de "12.34%"', () => {
    expect(parsePercent('12.34%')).toBe(12.34)
    expect(parsePercent('0.00%')).toBe(0)
    expect(parsePercent('150%')).toBe(150)
  })

  it('tolera vírgula decimal e lixo', () => {
    expect(parsePercent('7,5%')).toBe(7.5)
    expect(parsePercent('--')).toBe(0)
  })
})

describe('parseStatsTable', () => {
  it('faz o parse da saída do wslc stats --no-stream', () => {
    const widths = [15, 8, 10, 22, 9, 16, 14]
    const text = [
      line(['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'BLOCK I/O'], widths),
      line(
        ['a1b2c3d4e5f6', 'web', '12.34%', '24.5MiB / 4GiB', '0.60%', '1.2kB / 3.4kB', '12MB / 0B'],
        widths
      ),
      line(['f6e5d4c3b2a1', 'db', '0.00%', '180MiB / 4GiB', '4.39%', '0B / 0B', '80MB / 4MB'], widths)
    ].join('\n')

    const stats = parseStatsTable(text)
    expect(stats).toHaveLength(2)
    expect(stats[0]).toEqual({
      id: 'a1b2c3d4e5f6',
      name: 'web',
      cpuPercent: 12.34,
      memUsage: '24.5MiB / 4GiB',
      memPercent: 0.6,
      netIO: '1.2kB / 3.4kB',
      blockIO: '12MB / 0B'
    })
    expect(stats[1].memPercent).toBe(4.39)
  })

  it('retorna [] para saída vazia', () => {
    expect(parseStatsTable('')).toEqual([])
  })
})
