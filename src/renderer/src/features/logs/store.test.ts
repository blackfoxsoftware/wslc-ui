import { describe, expect, it } from 'vitest'
import type { LogEntry } from '@shared/schemas'
import { installWslcApiMock } from '../../test/wslc-api'
import { filterEntries, useLogsStore } from './store'

function entry(partial: Partial<LogEntry>): LogEntry {
  return {
    id: 1,
    ts: 1_700_000_000_000,
    level: 'info',
    category: 'app',
    message: 'mensagem',
    ...partial
  }
}

describe('logs store', () => {
  it('load carrega o buffer do main', async () => {
    installWslcApiMock({
      listLogs: async () => [entry({ id: 1, message: 'do main' })]
    })
    await useLogsStore.getState().load()
    expect(useLogsStore.getState().entries).toHaveLength(1)
    expect(useLogsStore.getState().loaded).toBe(true)
  })

  it('append ignora eventos antes do load (evita duplicata) e acumula depois', async () => {
    installWslcApiMock({ listLogs: async () => [] })
    useLogsStore.getState().append(entry({ id: 1 }))
    expect(useLogsStore.getState().entries).toHaveLength(0)
    await useLogsStore.getState().load()
    useLogsStore.getState().append(entry({ id: 2, message: 'ao vivo' }))
    expect(useLogsStore.getState().entries.map((e) => e.message)).toEqual(['ao vivo'])
  })

  it('clear limpa no main e localmente', async () => {
    const api = installWslcApiMock({ listLogs: async () => [entry({})] })
    await useLogsStore.getState().load()
    await useLogsStore.getState().clear()
    expect(api.clearLogs).toHaveBeenCalledOnce()
    expect(useLogsStore.getState().entries).toHaveLength(0)
  })
})

describe('filterEntries', () => {
  const entries = [
    entry({ id: 1, level: 'debug', category: 'cli', message: 'wslc ps' }),
    entry({ id: 2, level: 'info', category: 'native', message: 'sessão criada' }),
    entry({ id: 3, level: 'error', category: 'ipc', message: 'canal falhou', detail: 'ZodError: xyz' })
  ]

  it('nível é um mínimo (info+ esconde debug)', () => {
    expect(filterEntries(entries, 'info', 'all', '').map((e) => e.id)).toEqual([2, 3])
    expect(filterEntries(entries, 'debug', 'all', '')).toHaveLength(3)
    expect(filterEntries(entries, 'error', 'all', '').map((e) => e.id)).toEqual([3])
  })

  it('filtra por categoria e por texto (mensagem + detalhe)', () => {
    expect(filterEntries(entries, 'debug', 'native', '').map((e) => e.id)).toEqual([2])
    expect(filterEntries(entries, 'debug', 'all', 'ZODERROR').map((e) => e.id)).toEqual([3])
    expect(filterEntries(entries, 'debug', 'all', 'sessão').map((e) => e.id)).toEqual([2])
  })
})
