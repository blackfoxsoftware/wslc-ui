import { create } from 'zustand'

const RAIL_KEY = 'wslc-ui:rail-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

interface UiState {
  railCollapsed: boolean
  toggleRail: () => void
}

/** Preferências de chrome que vivem só no renderer. */
export const useUiStore = create<UiState>()((set, get) => ({
  railCollapsed: readCollapsed(),
  toggleRail: () => {
    const next = !get().railCollapsed
    set({ railCollapsed: next })
    try {
      localStorage.setItem(RAIL_KEY, next ? '1' : '0')
    } catch {
      // sem persistência é aceitável
    }
  }
}))
