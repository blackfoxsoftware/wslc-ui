import { toast } from '@/design'
import { create } from 'zustand'
import type { VhdVolumeOptions, VolumeInfo } from '@shared/schemas'
import { errorMessage } from '../../lib/errors'

interface VolumesState {
  volumes: VolumeInfo[]
  error: string | null
  refresh: () => Promise<void>
  /** Retorna true se o volume foi criado. `vhd` só vale no motor nativo. */
  create: (name: string, vhd?: VhdVolumeOptions) => Promise<boolean>
  remove: (name: string) => Promise<void>
  pruneUnused: () => Promise<void>
  removeAll: () => Promise<void>
}

/** Volumes nomeados. Resultados de ação chegam ao usuário via toast. */
export const useVolumesStore = create<VolumesState>()((set, get) => ({
  volumes: [],
  error: null,
  refresh: async () => {
    try {
      set({ volumes: await window.wslcApi.listVolumes(), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  create: async (name, vhd) => {
    const res = await window.wslcApi.createVolume(name, vhd)
    await get().refresh()
    if (res.ok) toast.success(`Volume "${name}" criado.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao criar o volume "${name}".`)
    return res.ok
  },
  remove: async (name) => {
    const res = await window.wslcApi.removeVolume(name)
    await get().refresh()
    if (res.ok) toast.success(`Volume "${name}" removido.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao remover o volume "${name}".`)
  },
  pruneUnused: async () => {
    const res = await window.wslcApi.pruneVolumes()
    await get().refresh()
    if (res.ok) toast.success('Volumes sem uso removidos.')
    else toast.danger(res.stderr || res.stdout || 'Falha ao remover os volumes sem uso.')
  },
  removeAll: async () => {
    const all = await window.wslcApi.listVolumes()
    if (all.length === 0) {
      toast.info('Nenhum volume para remover.')
      return
    }
    let failures = 0
    // Sequencial de propósito: não sobrecarregar a CLI do wslc.
    // oxlint-disable no-await-in-loop
    for (const volume of all) {
      const res = await window.wslcApi.removeVolume(volume.name)
      if (!res.ok) failures++
    }
    // oxlint-enable no-await-in-loop
    await get().refresh()
    if (failures === 0) toast.success(`${all.length} volume(s) removido(s).`)
    else toast.danger(`Falha ao remover ${failures} de ${all.length} volumes.`)
  }
}))
