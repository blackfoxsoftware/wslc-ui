import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hrHex, hrText } from './bindings'

/**
 * Os HRESULTs do wslcsdk e a tradução deles.
 *
 * O SDK só devolve `errorMessage` em algumas chamadas; nas outras a mensagem
 * é o HRESULT cru, e "0x80040610" não diz nem o que houve nem o que fazer. A
 * tabela em `bindings.ts` vem da referência oficial (error-codes.md do
 * microsoft/WSL) — e o teste de baixo confere que ela não ficou para trás do
 * header que está no repositório, que é a fonte que de fato compilamos.
 */
describe('hrText', () => {
  it('hex sozinho quando o código é desconhecido', () => {
    expect(hrHex(-2147024809)).toBe('0x80070057')
    expect(hrText(-2147024809)).toBe('0x80070057')
  })

  it('explica o erro novo da 2.9.9 (VM da sessão encerrada por ociosidade)', () => {
    expect(hrText(0x80040610 | 0)).toBe(
      '0x80040610 (a VM da sessão não está em execução — ela é encerrada por inatividade e volta na próxima operação)'
    )
  })

  it('explica os casos que a UI mais encontra', () => {
    expect(hrText(0x80040603 | 0)).toContain('container não encontrado')
    expect(hrText(0x80040606 | 0)).toContain('o container está em execução')
    expect(hrText(0x8004060b | 0)).toContain('mais novo que o WSL instalado')
    // E_NOTIMPL: o preview recusa UDP e VHD fixo por aqui.
    expect(hrText(0x80004001 | 0)).toContain('não implementado')
  })

  /**
   * Guarda contra deriva: se a Microsoft acrescentar um WSLC_E_* no header
   * empacotado, este teste falha até alguém escrever o texto em português.
   * É o mesmo problema do `--format json` — o contrato muda entre versões, e
   * a gente só descobre quando aparece na tela de quem usa.
   */
  it('todo WSLC_E_* do header 2.9.9 tem tradução', () => {
    const header = readFileSync(
      join(process.cwd(), 'vendor', 'wslcsdk', 'include', '2.9.9', 'wslcsdk.h'),
      'utf8'
    )
    const codigos = [...header.matchAll(/#define\s+(WSLC_E_[A-Z_]+)[^\n]*?\/\*\s*(0x[0-9A-Fa-f]{8})\s*\*\//g)]
    expect(codigos.length).toBeGreaterThanOrEqual(16)

    const semTraducao = codigos
      .map(([, nome, hex]) => ({ nome, texto: hrText(Number.parseInt(hex, 16) | 0) }))
      .filter(({ texto }) => !texto.includes('('))
      .map(({ nome }) => nome)

    expect(semTraducao).toEqual([])
  })
})
