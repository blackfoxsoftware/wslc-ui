import { create } from 'zustand'
import type { NativeStatus } from '@shared/schemas'

interface NativeState {
  status: NativeStatus | null
  refresh: () => Promise<void>
}

/** Estado da API nativa (wslcsdk.dll via FFI), exibido em Sistema. */
export const useNativeStore = create<NativeState>()((set) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: await window.wslcApi.getNativeStatus() })
    } catch {
      // melhor-esforço: sem status nativo o card mostra "verificando"
    }
  }
}))
