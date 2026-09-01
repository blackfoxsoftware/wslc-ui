import { create } from 'zustand'
import type { ContainerInfo, ContainerStats } from '@shared/schemas'

export interface StatsSample {
  at: number
  cpu: number
  mem: number
}

const HISTORY_LIMIT = 40

interface StatsState {
  byId: Record<string, ContainerStats>
  history: Record<string, StatsSample[]>
  refresh: () => Promise<void>
}

/** Métricas do `wslc stats` com histórico curto para sparklines. */
export const useStatsStore = create<StatsState>()((set, get) => ({
  byId: {},
  history: {},
  refresh: async () => {
    try {
      const stats = await window.wslcApi.getStats()
      const at = Date.now()
      const byId: Record<string, ContainerStats> = {}
      const history: Record<string, StatsSample[]> = {}
      for (const s of stats) {
        const key = s.id || s.name
        byId[key] = s
        history[key] = [...(get().history[key] ?? []), { at, cpu: s.cpuPercent, mem: s.memPercent }].slice(
          -HISTORY_LIMIT
        )
      }
      set({ byId, history })
    } catch {
      // Monitoramento é melhor-esforço: o stats pode não estar disponível no preview.
    }
  }
}))

/** Busca as métricas de um container por id (com fallback por nome). */
export function statsFor(
  byId: Record<string, ContainerStats>,
  container: ContainerInfo
): ContainerStats | undefined {
  return (
    byId[container.id] ?? Object.values(byId).find((s) => s.name === container.name && container.name !== '')
  )
}
