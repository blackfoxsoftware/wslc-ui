import { toast } from '@/design'
import { create } from 'zustand'
import type { CreateNetworkOptions, NetworkInfo } from '@shared/schemas'
import { errorMessage } from '../../lib/errors'

interface NetworksState {
  networks: NetworkInfo[]
  error: string | null
  refresh: () => Promise<void>
  /** Retorna true se a rede foi criada. */
  create: (opts: CreateNetworkOptions) => Promise<boolean>
  remove: (name: string) => Promise<void>
  pruneUnused: () => Promise<void>
  connect: (network: string, container: string) => Promise<boolean>
  disconnect: (network: string, container: string) => Promise<boolean>
}

/** Redes da CLI wslc. Resultados de ação chegam ao usuário via toast. */
export const useNetworksStore = create<NetworksState>()((set, get) => ({
  networks: [],
  error: null,
  refresh: async () => {
    try {
      set({ networks: await window.wslcApi.listNetworks(), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  create: async (opts) => {
    const res = await window.wslcApi.createNetwork(opts)
    await get().refresh()
    if (res.ok) toast.success(`Rede "${opts.name}" criada.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao criar a rede "${opts.name}".`)
    return res.ok
  },
  remove: async (name) => {
    const res = await window.wslcApi.removeNetwork(name)
    await get().refresh()
    if (res.ok) toast.success(`Rede "${name}" removida.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao remover a rede "${name}".`)
  },
  pruneUnused: async () => {
    const res = await window.wslcApi.pruneNetworks()
    await get().refresh()
    if (res.ok) toast.success(res.stdout.trim() || 'Redes sem containers removidas.')
    else toast.danger(res.stderr || res.stdout || 'Falha ao remover as redes sem uso.')
  },
  connect: async (network, container) => {
    const res = await window.wslcApi.connectNetwork(network, container)
    if (res.ok) toast.success(`Container conectado à rede "${network}".`)
    else toast.danger(res.stderr || res.stdout || 'Falha ao conectar o container.')
    return res.ok
  },
  disconnect: async (network, container) => {
    const res = await window.wslcApi.disconnectNetwork(network, container)
    if (res.ok) toast.success(`Container desconectado da rede "${network}".`)
    else toast.danger(res.stderr || res.stdout || 'Falha ao desconectar o container.')
    return res.ok
  }
}))
