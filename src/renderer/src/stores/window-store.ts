import { create } from 'zustand'

interface WindowState {
  maximized: boolean
  refresh: () => Promise<void>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
}

/** Estado e controles da janela frameless (topbar customizada). */
export const useWindowStore = create<WindowState>()((set) => ({
  maximized: false,
  refresh: async () => {
    set({ maximized: await window.wslcApi.isWindowMaximized() })
  },
  minimize: () => window.wslcApi.minimizeWindow(),
  toggleMaximize: async () => {
    set({ maximized: await window.wslcApi.toggleMaximizeWindow() })
  },
  close: () => window.wslcApi.closeWindow()
}))

/** Liga o evento de estado da janela à store. Retorna o unsubscribe. */
export function initWindowSubscriptions(): () => void {
  return window.wslcApi.onWindowState((ev) => useWindowStore.setState({ maximized: ev.maximized }))
}
