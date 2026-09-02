import { describe, expect, it } from 'vitest'
import { parseJsonLines } from './json-lines'

describe('parseJsonLines', () => {
  it('lê NDJSON — o formato da CLI 2.9.9', () => {
    // Captura literal de `wslc network list --format json` (wslc 2.9.9.0).
    const stdout =
      '{"CreatedAt":"2026-09-02 02:55:43.556721287 +0000 UTC","Driver":"bridge","ID":"d2a0fec3fd2a","IPv4":"true","IPv6":"false","Internal":"false","Labels":"","Name":"bridge","Scope":"local"}\n' +
      '{"CreatedAt":"2026-08-23 18:01:55.49285111 +0000 UTC","Driver":"host","ID":"8f1013ae0e91","IPv4":"true","IPv6":"false","Internal":"false","Labels":"","Name":"host","Scope":"local"}\n'
    const rows = parseJsonLines<{ Name: string; ID: string }>(stdout)
    expect(rows.map((r) => r.Name)).toEqual(['bridge', 'host'])
    expect(rows[0].ID).toBe('d2a0fec3fd2a')
  })

  it('lê o array JSON da 2.9.4 — a CLI vem do Windows Update, não escolhemos a versão', () => {
    const rows = parseJsonLines<{ Name: string }>('[{"Name":"bridge"},\n{"Name":"host"}]')
    expect(rows.map((r) => r.Name)).toEqual(['bridge', 'host'])
  })

  it('saída vazia é lista vazia (list sem containers não imprime nada)', () => {
    expect(parseJsonLines('')).toEqual([])
    expect(parseJsonLines('   \n\n')).toEqual([])
  })

  it('ignora linhas de ruído em volta das linhas JSON', () => {
    const rows = parseJsonLines<{ Name: string }>('[wslc] Found 1 session\n{"Name":"bridge"}\n')
    expect(rows).toEqual([{ Name: 'bridge' }])
  })

  it('tolera BOM no começo da saída', () => {
    expect(parseJsonLines<{ a: number }>('﻿{"a":1}')).toEqual([{ a: 1 }])
  })

  it('lança quando NADA na saída é JSON — o chamador precisa cair na tabela', () => {
    expect(() => parseJsonLines('ID DO CONTÊINER   NOME\nabc123   web')).toThrow()
    expect(() => parseJsonLines('[{"Name":')).toThrow()
  })
})
