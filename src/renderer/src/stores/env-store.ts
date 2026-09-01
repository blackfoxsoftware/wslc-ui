import { create } from 'zustand'
import type { WslcEnvironment } from '@shared/schemas'

interface EnvState {
  env: WslcEnvironment | null
  checking: boolean
  refresh: () => Promise<void>
}

/** Ambiente WSL/wslc detectado — alimenta o gate de setup e o rodapé. */
export const useEnvStore = create<EnvState>()((set) => ({
  env: null,
  checking: true,
  refresh: async () => {
    set({ checking: true })
    try {
      set({ env: await window.wslcApi.getEnvironment() })
    } finally {
      set({ checking: false })
    }
  }
}))
