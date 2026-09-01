/**
 * `patchnotes.json`: validação e geração das notas de release.
 *
 * O arquivo é a ÚNICA fonte das notas de uma versão. O release não lê commits
 * nem PRs: o que sai na tag `v<versao>` é o que estiver escrito aqui para a
 * versão do `package.json`. Isso mantém as notas em português, editáveis e
 * revisáveis na PR que as introduz — em vez de um despejo de mensagens de
 * commit gerado depois, quando ninguém mais lembra o que mudou.
 *
 * A validação é rígida de propósito, porque um erro aqui só apareceria na hora
 * de publicar: versões em semver, ordem decrescente (a mais nova primeiro),
 * datas reais, itens de uma linha e chaves conhecidas — uma categoria escrita
 * errada viraria uma seção silenciosamente vazia nas notas.
 *
 * Roda direto no Node 24 (type stripping), sem build e sem dependências, para
 * que o CI possa validar as notas sem instalar nada:
 *
 *   node scripts/patchnotes.ts                        valida tudo + confere a versão atual
 *   node scripts/patchnotes.ts --notas                markdown da versão do package.json
 *   node scripts/patchnotes.ts --notas --versao 0.2.0
 *   node scripts/patchnotes.ts --notas --saida notas.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Categorias aceitas, na ordem em que saem nas notas. */
export const CATEGORIAS = ['adicionado', 'alterado', 'corrigido', 'removido', 'seguranca'] as const

export type Categoria = (typeof CATEGORIAS)[number]

const TITULO: Record<Categoria, string> = {
  adicionado: 'Adicionado',
  alterado: 'Alterado',
  corrigido: 'Corrigido',
  removido: 'Removido',
  seguranca: 'Segurança'
}

export interface Versao {
  /** Semver, igual ao `version` do package.json quando for a versão a publicar. */
  versao: string
  /** ISO `AAAA-MM-DD`. */
  data: string
  /** Uma linha de resumo, opcional, que vira a abertura das notas. */
  titulo?: string
  mudancas: Partial<Record<Categoria, string[]>>
}

export type Patchnotes = { ok: true; versoes: Versao[] } | { ok: false; problemas: string[] }

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** A data existe de verdade? (`2026-02-31` casa com o regex e não existe.) */
function dataReal(texto: string): boolean {
  const d = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto
}

/**
 * Compara duas versões semver. Negativo = `a` é mais antiga.
 *
 * Pré-lançamento é MENOR que a versão final (`1.0.0-rc.1` < `1.0.0`), como
 * manda o semver — é o que faz a ordem do arquivo bater com a ordem real das
 * tags quando existe um rc.
 */
export function compararVersoes(a: string, b: string): number {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (ma === null || mb === null) return a.localeCompare(b)

  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i])
    if (diff !== 0) return diff
  }

  const pa = ma[4]
  const pb = mb[4]
  if (pa === undefined && pb === undefined) return 0
  if (pa === undefined) return 1
  if (pb === undefined) return -1

  const ia = pa.split('.')
  const ib = pb.split('.')
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    const xa = ia[i]
    const xb = ib[i]
    if (xa === undefined) return -1
    if (xb === undefined) return 1
    if (xa === xb) continue
    const na = /^\d+$/.test(xa)
    const nb = /^\d+$/.test(xb)
    if (na && nb) return Number(xa) - Number(xb)
    return na ? -1 : nb ? 1 : xa.localeCompare(xb)
  }
  return 0
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validarEntrada(bruto: unknown, onde: string, problemas: string[]): Versao | null {
  if (!ehObjeto(bruto)) {
    problemas.push(`${onde}: deveria ser um objeto`)
    return null
  }

  for (const chave of Object.keys(bruto)) {
    if (!['versao', 'data', 'titulo', 'mudancas'].includes(chave)) {
      problemas.push(`${onde}: chave desconhecida "${chave}"`)
    }
  }

  const versao = bruto['versao']
  if (typeof versao !== 'string' || !SEMVER.test(versao)) {
    problemas.push(
      `${onde}: "versao" deve ser semver (ex.: 1.2.3 ou 1.2.3-rc.1), recebi ${JSON.stringify(versao)}`
    )
    return null
  }

  const data = bruto['data']
  if (typeof data !== 'string' || !DATA.test(data) || !dataReal(data)) {
    problemas.push(`${versao}: "data" deve ser uma data real em AAAA-MM-DD, recebi ${JSON.stringify(data)}`)
  }

  const titulo = bruto['titulo']
  if (titulo !== undefined && (typeof titulo !== 'string' || titulo.trim() === '' || titulo.includes('\n'))) {
    problemas.push(`${versao}: "titulo" deve ser uma linha de texto`)
  }

  const mudancas: Partial<Record<Categoria, string[]>> = {}
  const brutoMudancas = bruto['mudancas']
  if (!ehObjeto(brutoMudancas)) {
    problemas.push(`${versao}: "mudancas" deveria ser um objeto com as categorias (${CATEGORIAS.join(', ')})`)
  } else {
    for (const [chave, itens] of Object.entries(brutoMudancas)) {
      if (!CATEGORIAS.includes(chave as Categoria)) {
        problemas.push(`${versao}: categoria desconhecida "${chave}" — use ${CATEGORIAS.join(', ')}`)
        continue
      }
      if (!Array.isArray(itens)) {
        problemas.push(`${versao}: "${chave}" deveria ser uma lista de textos`)
        continue
      }
      const limpos: string[] = []
      for (const [i, item] of itens.entries()) {
        if (typeof item !== 'string' || item.trim() === '') {
          problemas.push(`${versao}: "${chave}"[${i}] deveria ser um texto não vazio`)
          continue
        }
        if (item.includes('\n')) {
          problemas.push(`${versao}: "${chave}"[${i}] deveria caber em uma linha`)
          continue
        }
        limpos.push(item.trim())
      }
      if (limpos.length > 0) mudancas[chave as Categoria] = limpos
    }
    if (Object.keys(mudancas).length === 0) {
      problemas.push(`${versao}: nenhuma mudança listada — uma versão sem notas não deveria ser publicada`)
    }
  }

  return {
    versao,
    data: typeof data === 'string' ? data : '',
    ...(typeof titulo === 'string' ? { titulo: titulo.trim() } : {}),
    mudancas
  }
}

/** Valida o conteúdo já desserializado do patchnotes.json. */
export function lerPatchnotes(bruto: unknown): Patchnotes {
  const problemas: string[] = []

  if (!ehObjeto(bruto)) return { ok: false, problemas: ['raiz: deveria ser um objeto { "versoes": [...] }'] }
  for (const chave of Object.keys(bruto)) {
    if (chave !== 'versoes') problemas.push(`raiz: chave desconhecida "${chave}"`)
  }

  const lista = bruto['versoes']
  if (!Array.isArray(lista)) {
    problemas.push('raiz: "versoes" deveria ser uma lista, da mais nova para a mais antiga')
    return { ok: false, problemas }
  }
  if (lista.length === 0) problemas.push('raiz: "versoes" está vazia')

  const versoes: Versao[] = []
  for (const [i, item] of lista.entries()) {
    const entrada = validarEntrada(item, `versoes[${i}]`, problemas)
    if (entrada !== null) versoes.push(entrada)
  }

  const vistas = new Set<string>()
  for (const v of versoes) {
    if (vistas.has(v.versao)) problemas.push(`${v.versao}: versão repetida`)
    vistas.add(v.versao)
  }

  for (let i = 1; i < versoes.length; i++) {
    const anterior = versoes[i - 1]
    const atual = versoes[i]
    if (anterior === undefined || atual === undefined) continue
    // `< 0` e não `<= 0`: versões iguais já foram reportadas como repetidas.
    if (compararVersoes(anterior.versao, atual.versao) < 0) {
      problemas.push(
        `${atual.versao}: fora de ordem — a lista vai da mais nova para a mais antiga (veio depois de ${anterior.versao})`
      )
    }
  }

  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, versoes }
}

export function encontrarVersao(versoes: Versao[], versao: string): Versao | undefined {
  return versoes.find((v) => v.versao === versao)
}

/**
 * Corpo markdown da release. Sem o número da versão no topo: o GitHub já mostra
 * a tag e o nome da release acima do corpo, repetir só ocupa espaço.
 */
export function notasMarkdown(v: Versao): string {
  const partes: string[] = []
  if (v.titulo !== undefined) partes.push(v.titulo, '')

  for (const cat of CATEGORIAS) {
    const itens = v.mudancas[cat]
    if (itens === undefined || itens.length === 0) continue
    partes.push(`### ${TITULO[cat]}`, '')
    for (const item of itens) partes.push(`- ${item}`)
    partes.push('')
  }

  return `${partes.join('\n').trimEnd()}\n`
}

// ---------------------------------------------------------------------- CLI

interface Opcoes {
  notas: boolean
  versao?: string
  saida?: string
}

function parseArgs(argv: string[]): Opcoes | string {
  const op: Opcoes = { notas: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--notas') op.notas = true
    else if (arg === '--versao' || arg === '--saida') {
      const valor = argv[++i]
      if (valor === undefined || valor.startsWith('--')) return `falta o valor de ${arg}`
      if (arg === '--versao') op.versao = valor
      else op.saida = valor
    } else return `argumento desconhecido: ${arg}`
  }
  return op
}

function main(argv: string[]): number {
  const op = parseArgs(argv)
  if (typeof op === 'string') {
    console.error(`patchnotes: ${op}`)
    return 1
  }

  const raiz = resolve(import.meta.dirname, '..')
  const arquivo = join(raiz, 'patchnotes.json')

  let bruto: unknown
  try {
    bruto = JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch (e: unknown) {
    console.error(`patchnotes.json: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  const notas = lerPatchnotes(bruto)
  if (!notas.ok) {
    console.error(`patchnotes.json inválido (${notas.problemas.length}):`)
    for (const p of notas.problemas) console.error(`  - ${p}`)
    return 1
  }

  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as { version: string }
  const alvo = op.versao ?? pkg.version
  const entrada = encontrarVersao(notas.versoes, alvo)

  if (entrada === undefined) {
    console.error(`patchnotes.json não tem a versão ${alvo}.`)
    if (op.versao === undefined) {
      console.error('Ela é a versão do package.json — escreva as notas dela antes de publicar.')
    }
    return 1
  }

  if (!op.notas) {
    console.log(`patchnotes.json ok — ${notas.versoes.length} versão(ões), ${alvo} pronta para publicar.`)
    return 0
  }

  const corpo = notasMarkdown(entrada)
  if (op.saida === undefined) process.stdout.write(corpo)
  else {
    writeFileSync(resolve(op.saida), corpo, 'utf8')
    console.log(`notas de ${alvo} escritas em ${op.saida}`)
  }
  return 0
}

// Só roda como CLI: importado pelos testes, o módulo não deve fazer nada.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = main(process.argv.slice(2))
}
