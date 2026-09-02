import { toast } from '@/design'
import { create } from 'zustand'
import type {
  ContainerActionOptions,
  ContainerAction,
  ContainerCopyOptions,
  ContainerInfo
} from '@shared/schemas'
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
  applyAction: (
    action: ContainerAction,
    container: ContainerInfo,
    opts?: ContainerActionOptions
  ) => Promise<void>
  /** SIGKILL imediato (`container kill`). */
  kill: (container: ContainerInfo) => Promise<void>
  /** Exporta o filesystem para um tarball (diálogo de salvar). */
  exportFs: (container: ContainerInfo) => Promise<void>
  /**
   * `container cp`: retorna true quando a cópia terminou (fecha o diálogo).
   * `label` é só para o aviso — o que vai para a CLI é `opts.container`.
   */
  copy: (opts: ContainerCopyOptions, label?: string) => Promise<boolean>
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
  applyAction: async (action, container, opts) => {
    const label = container.name || container.id.slice(0, 12)
    set({ busyId: container.id })
    try {
      const res = await window.wslcApi.containerAction(action, container.id || container.name, opts)
      await get().refresh()
      if (res.ok) {
        toast.success(`Container "${label}" ${DONE[action]}.`)
        return
      }
      const erro = res.stderr || res.stdout || `Falha ao ${action} o container "${label}".`
      // Remover container em execução é erro na CLI. Em vez de um segundo item
      // de menu perigoso, a saída forçada aparece no próprio toast da falha.
      if (action === 'remove' && !opts?.force) {
        toast.danger(erro, {
          timeout: 10_000,
          actionProps: {
            children: 'Remover mesmo assim',
            onPress: () => void get().applyAction('remove', container, { force: true })
          }
        })
        return
      }
      toast.danger(erro)
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
  copy: async (opts, label) => {
    set({ busyId: opts.container })
    try {
      const res = await window.wslcApi.copyToContainer(opts)
      const dentro = `${label || opts.container}:${opts.containerPath}`
      const [de, para] = opts.direction === 'to-container' ? [opts.hostPath, dentro] : [dentro, opts.hostPath]
      if (res.ok) toast.success(`Copiado ${de} → ${para}.`)
      else toast.danger(res.stderr || res.stdout || 'Falha ao copiar os arquivos.')
      return res.ok
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
      // Força: entre o stop e o remove, um container com --restart pode ter
      // voltado, e a lista pode ter envelhecido desde a leitura.
      const res = await window.wslcApi.containerAction('remove', id, { force: true })
      if (!res.ok) failures++
    }
    // oxlint-enable no-await-in-loop
    await get().refresh()
    if (failures === 0) toast.success(`${all.length} container(s) removido(s).`)
    else toast.danger(`Falha ao remover ${failures} de ${all.length} containers.`)
  }
}))
