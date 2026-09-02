/**
 * Parser do `--format json` da CLI wslc.
 *
 * O formato MUDOU entre versões: até a 2.9.4 a saída era um array JSON único;
 * da 2.9.9 em diante é NDJSON — um objeto por linha, sem array em volta:
 *
 *   {"Driver":"bridge","ID":"d2a0fec3fd2a","Name":"bridge",...}
 *   {"Driver":"host","ID":"8f1013ae0e91","Name":"host",...}
 *
 * Um `JSON.parse` do texto inteiro engasga na segunda linha, com a mensagem
 * "Unexpected non-whitespace character after JSON at position N (line 2)".
 *
 * Como a CLI é instalada pelo Windows Update e não por nós, o app não escolhe
 * qual versão vai encontrar. Então este parser aceita as DUAS formas, e é ele
 * que todo `--format json` usa — nenhum ponto do código chama JSON.parse na
 * saída da CLI direto.
 */

/** Uma linha só, tolerante a BOM e a espaço em volta. */
function parseOne<T>(line: string): T | null {
  const trimmed = line.replace(/^﻿/, '').trim()
  if (trimmed.length === 0) return null
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}

/**
 * Linhas JSON (NDJSON) ou um array JSON — devolve sempre uma lista.
 *
 * Saída vazia é uma lista vazia, não um erro: `container list` sem containers
 * imprime exatamente nada. Lança apenas quando há texto e NENHUMA linha é
 * JSON válido, porque aí a saída não é o que pedimos (uma mensagem de erro,
 * uma tabela) e quem chamou precisa cair no caminho alternativo.
 */
export function parseJsonLines<T>(stdout: string): T[] {
  const text = stdout.replace(/^﻿/, '').trim()
  if (text.length === 0) return []

  // Formato antigo (<= 2.9.4): um array só, possivelmente com quebras de linha.
  // Só vale se o texto INTEIRO for o array — senão um aviso solto do tipo
  // "[wslc] Found 2 sessions" seria confundido com o começo de um.
  if (text.startsWith('[')) {
    const arr = parseOne<T[]>(text)
    if (Array.isArray(arr)) return arr
  }

  const rows: T[] = []
  let ignoradas = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    const row = parseOne<T>(line)
    if (row === null) ignoradas += 1
    else rows.push(row)
  }
  // Linhas soltas de ruído (avisos do tipo "[wslc] Found 2 sessions") não
  // invalidam a listagem; texto que não tem UMA linha JSON, sim.
  if (rows.length === 0 && ignoradas > 0) throw new Error('a saída da CLI não é JSON')
  return rows
}
