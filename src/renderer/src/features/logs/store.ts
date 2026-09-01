import { create } from 'zustand'
import type { LogCategory, LogEntry, LogLevel } from '@shared/schemas'

/**
 * View de logs do app: carrega o buffer do processo main e recebe as novas
 * entradas ao vivo (evento `logs:entry`, assinado no AppShell).
 */

const MAX_ENTRIES = 2000

export const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

interface LogsStore {
  entries: LogEntry[]
  loaded: boolean
  /** painel inferior expandido? */
  panelOpen: boolean
  /** nível mínimo exibido */
  level: LogLevel
  category: LogCategory | 'all'
  query: string
  autoScroll: boolean
  load: () => Promise<void>
  append: (entry: LogEntry) => void
  clear: () => Promise<void>
  togglePanel: () => void
  setLevel: (level: LogLevel) => void
  setCategory: (category: LogCategory | 'all') => void
  setQuery: (query: string) => void
  setAutoScroll: (autoScroll: boolean) => void
}

export const useLogsStore = create<LogsStore>()((set) => ({
  entries: [],
  loaded: false,
  panelOpen: false,
  level: 'info',
  category: 'all',
  query: '',
  autoScroll: true,
  load: async () => {
    const entries = await window.wslcApi.listLogs()
    set({ entries, loaded: true })
  },
  append: (entry) =>
    set((s) => {
      // Antes do load inicial não acumula (o load traria a entrada duplicada).
      if (!s.loaded) return s
      const entries = [...s.entries, entry]
      return { entries: entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries }
    }),
  clear: async () => {
    await window.wslcApi.clearLogs()
    set({ entries: [] })
  },
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setLevel: (level) => set({ level }),
  setCategory: (category) => set({ category }),
  setQuery: (query) => set({ query }),
  setAutoScroll: (autoScroll) => set({ autoScroll })
}))

/** Aplica os filtros correntes (nível mínimo, categoria e busca de texto). */
export function filterEntries(
  entries: LogEntry[],
  level: LogLevel,
  category: LogCategory | 'all',
  query: string
): LogEntry[] {
  const min = LEVEL_ORDER[level]
  const q = query.trim().toLowerCase()
  return entries.filter((e) => {
    if (LEVEL_ORDER[e.level] < min) return false
    if (category !== 'all' && e.category !== category) return false
    if (q && !`${e.message}\n${e.detail ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}
