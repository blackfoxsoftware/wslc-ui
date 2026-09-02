import { create } from 'zustand'
import type { UpdateStatus } from '@shared/schemas'
import { toast } from '@/design'

interface UpdateState {
  status: UpdateStatus | null
  /** Uma checagem manual está em curso (o botão da aba Sistema). */
  checking: boolean
  load: () => Promise<void>
  check: () => Promise<void>
  install: () => Promise<void>
  /** Estado empurrado pelo processo main. */
  receive: (status: UpdateStatus) => void
}

/**
 * Avisa só quando há o que fazer, e uma vez por transição.
 *
 * O aviso é disparado pela MUDANÇA de estado, não pelo estado: o main empurra
 * o status a cada evento (incluindo progresso de download), e um toast por
 * evento viraria uma cascata.
 */
function notify(before: UpdateStatus | null, after: UpdateStatus): void {
  if (before?.state === after.state) return
  if (after.state === 'downloaded') {
    toast.success(`Versão ${after.newVersion} pronta — será instalada quando você fechar o app.`, {
      timeout: 10_000
    })
    return
  }
  // No portátil o ciclo para em 'available': não há instalador para aplicar.
  if (after.state === 'available' && after.mode === 'portable' && after.releaseUrl) {
    const url = after.releaseUrl
    toast.info(`Versão ${after.newVersion} disponível.`, {
      description: 'A versão portátil é trocada à mão: baixe o .exe novo na release.',
      timeout: 12_000,
      actionProps: {
        children: 'Abrir a release',
        onPress: () => void window.wslcApi.openExternal(url)
      }
    })
  }
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: null,
  checking: false,
  load: async () => {
    try {
      set({ status: await window.wslcApi.updateStatus() })
    } catch {
      // melhor-esforço: sem status o card mostra "verificando…"
    }
  },
  check: async () => {
    set({ checking: true })
    try {
      const status = await window.wslcApi.checkForUpdates()
      notify(get().status, status)
      set({ status })
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : String(e))
    } finally {
      set({ checking: false })
    }
  },
  install: async () => {
    // Não há "depois" para tratar: o app fecha para o instalador rodar.
    await window.wslcApi.installUpdate()
  },
  receive: (status) => {
    notify(get().status, status)
    set({ status })
  }
}))

/** Liga o store aos eventos do main. Devolve o cancelamento da assinatura. */
export function initUpdateSubscription(): () => void {
  void useUpdateStore.getState().load()
  return window.wslcApi.onUpdateStatus((status) => useUpdateStore.getState().receive(status))
}
