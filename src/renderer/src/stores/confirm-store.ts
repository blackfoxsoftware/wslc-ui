import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  ask: (opts: ConfirmOptions) => Promise<boolean>
  settle: (ok: boolean) => void
}

/** Fila (de um item) do modal de confirmação global. */
export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  current: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ current: { ...opts, resolve } })
    }),
  settle: (ok) => {
    const current = get().current
    if (!current) return
    set({ current: null })
    current.resolve(ok)
  }
}))

/** Substituto do confirm() nativo: abre o modal e resolve com a escolha. */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> => useConfirmStore.getState().ask(opts)
