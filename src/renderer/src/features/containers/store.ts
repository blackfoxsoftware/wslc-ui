import { toast } from '@/design'
import { create } from 'zustand'
import type { ContainerAction, ContainerInfo } from '@shared/schemas'
import { errorMessage } from '../../lib/errors'

const DONE: Record<ContainerAction, string> = {
  start: 'iniciado',
  stop: 'parado',
  restart: 'reiniciado',
  remove: 'removido'
}

interface ContainersState {
  containers: ContainerInfo[]
  showAll: boolean
  error: string | null
  busyId: string | null
  setShowAll: (showAll: boolean) => void
  refresh: () => Promise<void>
  applyAction: (action: ContainerAction, container: ContainerInfo) => Promise<void>
  /** SIGKILL imediato (`container kill`). */
  kill: (container: ContainerInfo) => Promise<void>
  /** Exporta o filesystem para um tarball (diálogo de salvar). */
  exportFs: (container: ContainerInfo) => Promise<void>
  pruneStopped: () => Promise<void>
  removeAll: () => Promise<void>
}

/** Lista de containers + ações. Resultados de ação chegam ao usuário via toast. */
export const useContainersStore = create<ContainersState>()((set, get) => ({
  containers: [],
  showAll: true,
  error: null,
  busyId: null,
  setShowAll: (showAll) => set({ showAll }),
  refresh: async () => {
    try {
      set({ containers: await window.wslcApi.listContainers(get().showAll), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  applyAction: async (action, container) => {
    const label = container.name || container.id.slice(0, 12)
    set({ busyId: container.id })
    try {
      const res = await window.wslcApi.containerAction(action, container.id || container.name)
      await get().refresh()
      if (res.ok) toast.success(`Container "${label}" ${DONE[action]}.`)
      else toast.danger(res.stderr || res.stdout || `Falha ao ${action} o container "${label}".`)
    } finally {
      set({ busyId: null })
    }
  },
  kill: async (container) => {
    const label = container.name || container.id.slice(0, 12)
    set({ busyId: container.id })
    try {
      const res = await window.wslcApi.killContainer(container.id || container.name)
      await get().refresh()
      if (res.ok) toast.success(`Container "${label}" encerrado (SIGKILL).`)
      else toast.danger(res.stderr || res.stdout || `Falha ao encerrar o container "${label}".`)
    } finally {
      set({ busyId: null })
    }
  },
  exportFs: async (container) => {
    const label = container.name || container.id.slice(0, 12)
    const path = await window.wslcApi.pickSaveFile(`Exportar filesystem de ${label}`, `${label}.tar`, ['tar'])
    if (!path) return
    set({ busyId: container.id })
    try {
      const res = await window.wslcApi.exportContainer(container.id || container.name, path)
      if (res.ok) toast.success(`Filesystem de "${label}" exportado para ${path}.`)
      else toast.danger(res.stderr || res.stdout || `Falha ao exportar "${label}".`)
    } finally {
      set({ busyId: null })
    }
  },
  pruneStopped: async () => {
    const res = await window.wslcApi.pruneContainers()
    await get().refresh()
    if (res.ok) toast.success('Containers parados removidos.')
    else toast.danger(res.stderr || res.stdout || 'Falha ao remover os containers parados.')
  },
  removeAll: async () => {
    const all = await window.wslcApi.listContainers(true)
    if (all.length === 0) {
      toast.info('Nenhum container para remover.')
      return
    }
    let failures = 0
    // Sequencial de propósito: parar antes de remover, sem sobrecarregar a CLI.
    // oxlint-disable no-await-in-loop
    for (const c of all) {
      const id = c.id || c.name
      if (c.state === 'running') await window.wslcApi.containerAction('stop', id)
      const res = await window.wslcApi.containerAction('remove', id)
      if (!res.ok) failures++
    }
    // oxlint-enable no-await-in-loop
    await get().refresh()
    if (failures === 0) toast.success(`${all.length} container(s) removido(s).`)
    else toast.danger(`Falha ao remover ${failures} de ${all.length} containers.`)
  }
}))
