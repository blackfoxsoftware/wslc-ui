import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLogEntries,
  closeLogger,
  getLogEntries,
  initLogger,
  logError,
  logInfo,
  setOnLogEntry
} from './logger'

describe('logger', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wslcui-logs-'))
    clearLogEntries()
  })

  afterEach(() => {
    setOnLogEntry(null)
    closeLogger()
    rmSync(dir, { recursive: true, force: true })
  })

  it('acumula no buffer com id crescente e nível/categoria', () => {
    const a = logInfo('app', 'primeira')
    const b = logError('native', 'segunda', 'stack aqui')
    expect(b.id).toBeGreaterThan(a.id)
    const entries = getLogEntries()
    const tail = entries.slice(-2)
    expect(tail[0]).toMatchObject({ level: 'info', category: 'app', message: 'primeira' })
    expect(tail[1]).toMatchObject({ level: 'error', category: 'native', detail: 'stack aqui' })
  })

  it('notifica o assinante a cada entrada', () => {
    const seen: string[] = []
    setOnLogEntry((entry) => seen.push(entry.message))
    logInfo('cli', 'olá')
    expect(seen).toEqual(['olá'])
  })

  it('grava no arquivo depois do initLogger', () => {
    initLogger(dir)
    logInfo('app', 'gravada em disco', 'detalhe\ncom duas linhas')
    closeLogger()
    const content = readFileSync(join(dir, 'wslc-ui.log'), 'utf8')
    expect(content).toContain('info  [app] gravada em disco')
    expect(content).toContain('    detalhe')
    expect(content).toContain('    com duas linhas')
  })

  it('rotaciona quando o arquivo passa do limite', () => {
    initLogger(dir, { rotateBytes: 200 })
    for (let i = 0; i < 10; i++) logInfo('app', `linha bem comprida para estourar o limite ${i}`)
    closeLogger()
    const old = readFileSync(join(dir, 'wslc-ui.old.log'), 'utf8')
    expect(old.length).toBeGreaterThan(0)
    // o arquivo corrente recomeçou depois da última rotação
    const current = readFileSync(join(dir, 'wslc-ui.log'), 'utf8')
    expect(current.length).toBeLessThan(old.length + 300)
  })

  it('clearLogEntries esvazia só o buffer', () => {
    logInfo('app', 'antes do clear')
    clearLogEntries()
    expect(getLogEntries()).toEqual([])
  })
})
