import { toast } from '@/design'
import { create } from 'zustand'
import type { Engine, EngineStatus } from '@shared/schemas'
import { errorMessage } from '../lib/errors'

export const ENGINE_LABELS: Record<Engine, string> = {
  cli: 'CLI (wslc.exe)',
  native: 'Nativo (wslcsdk)'
}

interface EngineState {
  status: EngineStatus | null
  switching: boolean
  load: () => Promise<void>
  setEngine: (engine: Engine) => Promise<void>
}

/** Motor de execução (CLI/Nativo), com toggle em Sistema. */
export const useEngineStore = create<EngineState>()((set, get) => ({
  status: null,
  switching: false,
  load: async () => {
    try {
      set({ status: await window.wslcApi.getEngine() })
    } catch {
      // melhor-esforço: sem status o toggle fica desabilitado
    }
  },
  setEngine: async (engine) => {
    if (get().switching || get().status?.engine === engine) return
    set({ switching: true })
    try {
      const status = await window.wslcApi.setEngine(engine)
      set({ status })
      // O main mantém a CLI quando a sessão nativa falha — o detail explica o porquê.
      if (status.engine === engine) toast.success(`Motor alterado para ${ENGINE_LABELS[engine]}.`)
      else toast.danger(status.detail)
    } catch (e) {
      toast.danger(errorMessage(e))
    } finally {
      set({ switching: false })
    }
  }
}))
