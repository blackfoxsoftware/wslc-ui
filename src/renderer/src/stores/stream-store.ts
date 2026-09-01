import { create } from 'zustand'
import type { ImageProgressLayer } from '@shared/schemas'

export interface StreamState {
  id: number
  title: string
  output: string
  running: boolean
  exitCode: number | null
  /** Progresso estruturado por camada (pull no motor nativo). */
  layers: ImageProgressLayer[]
}

interface StreamStore {
  stream: StreamState | null
  /** Abre um novo stream (logs, pull); encerra o anterior se ainda rodar. */
  open: (title: string, start: () => Promise<number>) => Promise<void>
  close: () => Promise<void>
  append: (id: number, chunk: string) => void
  progress: (id: number, layers: ImageProgressLayer[]) => void
  finish: (id: number, code: number | null) => void
}

/** Painel de saída em streaming (logs -f, image pull). */
export const useStreamStore = create<StreamStore>()((set, get) => ({
  stream: null,
  open: async (title, start) => {
    const current = get().stream
    if (current?.running) await window.wslcApi.stopStream(current.id)
    const id = await start()
    set({ stream: { id, title, output: '', running: true, exitCode: null, layers: [] } })
  },
  close: async () => {
    const current = get().stream
    if (current?.running) await window.wslcApi.stopStream(current.id)
    set({ stream: null })
  },
  append: (id, chunk) =>
    set((s) =>
      s.stream && s.stream.id === id ? { stream: { ...s.stream, output: s.stream.output + chunk } } : s
    ),
  progress: (id, layers) =>
    set((s) => (s.stream && s.stream.id === id ? { stream: { ...s.stream, layers } } : s)),
  finish: (id, code) =>
    set((s) =>
      s.stream && s.stream.id === id ? { stream: { ...s.stream, running: false, exitCode: code } } : s
    )
}))

/** Liga os eventos IPC de stream à store. Retorna o unsubscribe. */
export function initStreamSubscriptions(): () => void {
  const offData = window.wslcApi.onStreamData((ev) => useStreamStore.getState().append(ev.id, ev.chunk))
  const offProgress = window.wslcApi.onStreamProgress((ev) =>
    useStreamStore.getState().progress(ev.id, ev.layers)
  )
  const offExit = window.wslcApi.onStreamExit((ev) => useStreamStore.getState().finish(ev.id, ev.code))
  return () => {
    offData()
    offProgress()
    offExit()
  }
}
