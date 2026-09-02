import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  forgetAllContainers,
  forgetContainer,
  knownFilePath,
  readKnownContainers,
  rememberContainer,
  type KnownContainer
} from './known'

let dir: string
let file: string

const container = (id: string, name = id): KnownContainer => ({
  id,
  name,
  image: 'alpine:latest',
  command: 'sh',
  createdAt: 1_700_000_000_000,
  portsDisplay: '',
  autoRemove: false
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wslc-known-'))
  file = knownFilePath(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readKnownContainers', () => {
  it('devolve lista vazia quando o arquivo não existe', () => {
    expect(readKnownContainers(file)).toEqual([])
  })

  // O arquivo mora no storage da sessão, que o reset apaga inteiro — ler um
  // resto corrompido não pode derrubar a listagem de containers.
  it('devolve lista vazia com JSON podre', () => {
    writeFileSync(file, '{isso não é json', 'utf8')
    expect(readKnownContainers(file)).toEqual([])
  })

  it('ignora entradas sem id ou nome', () => {
    writeFileSync(file, JSON.stringify([container('abc'), { image: 'x' }, null, 'texto']), 'utf8')
    expect(readKnownContainers(file).map((c) => c.id)).toEqual(['abc'])
  })
})

describe('rememberContainer', () => {
  it('acrescenta e persiste', () => {
    rememberContainer(container('a1'), file)
    rememberContainer(container('b2'), file)
    expect(readKnownContainers(file).map((c) => c.id)).toEqual(['a1', 'b2'])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2)
  })

  it('substitui a entrada do mesmo id em vez de duplicar', () => {
    rememberContainer(container('a1', 'antigo'), file)
    rememberContainer(container('a1', 'novo'), file)
    const lista = readKnownContainers(file)
    expect(lista).toHaveLength(1)
    expect(lista[0]?.name).toBe('novo')
  })
})

describe('forgetContainer', () => {
  it('remove só o id pedido', () => {
    rememberContainer(container('a1'), file)
    rememberContainer(container('b2'), file)
    forgetContainer('a1', file)
    expect(readKnownContainers(file).map((c) => c.id)).toEqual(['b2'])
  })

  it('id inexistente não mexe no arquivo', () => {
    rememberContainer(container('a1'), file)
    const antes = readFileSync(file, 'utf8')
    forgetContainer('nao-existe', file)
    expect(readFileSync(file, 'utf8')).toBe(antes)
  })

  it('forgetAll esvazia', () => {
    rememberContainer(container('a1'), file)
    forgetAllContainers(file)
    expect(readKnownContainers(file)).toEqual([])
  })
})
