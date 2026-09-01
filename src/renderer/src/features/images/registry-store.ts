import { create } from 'zustand'
import type { RegistryImage } from '@shared/schemas'
import { errorMessage } from '../../lib/errors'

interface RegistryState {
  results: RegistryImage[]
  searching: boolean
  error: string | null
  /** Última consulta enviada (para descartar respostas atrasadas). */
  lastQuery: string
  search: (query: string) => Promise<void>
  clear: () => void
}

/** Busca ao vivo no Docker Hub (via processo main). */
export const useRegistryStore = create<RegistryState>()((set, get) => ({
  results: [],
  searching: false,
  error: null,
  lastQuery: '',
  search: async (query) => {
    set({ searching: true, error: null, lastQuery: query })
    try {
      const results = await window.wslcApi.searchRegistry(query)
      if (get().lastQuery !== query) return // resposta atrasada de uma busca antiga
      set({ results, searching: false })
    } catch (e) {
      if (get().lastQuery !== query) return
      set({ error: errorMessage(e), searching: false, results: [] })
    }
  },
  clear: () => set({ results: [], searching: false, error: null, lastQuery: '' })
}))
