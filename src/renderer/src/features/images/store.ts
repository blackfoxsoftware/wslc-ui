import { toast } from '@/design'
import { create } from 'zustand'
import type { ImageInfo } from '@shared/schemas'
import { errorMessage } from '../../lib/errors'

const refOf = (image: ImageInfo): string =>
  image.repository && image.tag ? `${image.repository}:${image.tag}` : image.id

interface ImagesState {
  images: ImageInfo[]
  error: string | null
  refresh: () => Promise<void>
  remove: (image: ImageInfo) => Promise<void>
  pruneUnused: () => Promise<void>
  removeAll: () => Promise<void>
  /** Retorna true se a tag foi criada (para fechar o diálogo). */
  tag: (source: string, target: string) => Promise<boolean>
  /** Exporta a imagem para .tar via diálogo de salvar (CLI `image save`). */
  save: (image: ImageInfo) => Promise<void>
}

/** Imagens locais (o pull passa pela stream store). Resultados via toast. */
export const useImagesStore = create<ImagesState>()((set, get) => ({
  images: [],
  error: null,
  refresh: async () => {
    try {
      set({ images: await window.wslcApi.listImages(), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  remove: async (image) => {
    const ref = refOf(image)
    const res = await window.wslcApi.removeImage(ref)
    await get().refresh()
    if (res.ok) toast.success(`Imagem "${ref}" removida.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao remover a imagem "${ref}".`)
  },
  tag: async (source, target) => {
    const res = await window.wslcApi.tagImage(source, target)
    await get().refresh()
    if (res.ok) toast.success(`Imagem "${source}" marcada como "${target}".`)
    else toast.danger(res.stderr || res.stdout || `Falha ao criar a tag "${target}".`)
    return res.ok
  },
  save: async (image) => {
    const ref = refOf(image)
    const shortRepo = image.repository.split('/').pop() || 'imagem'
    const defaultName = `${shortRepo}-${image.tag || 'latest'}.tar`
    const path = await window.wslcApi.pickSaveFile(`Salvar ${ref} como tarball`, defaultName, ['tar'])
    if (!path) return
    const res = await window.wslcApi.saveImage(ref, path)
    if (res.ok) toast.success(`Imagem "${ref}" salva em ${path}.`)
    else toast.danger(res.stderr || res.stdout || `Falha ao salvar a imagem "${ref}".`)
  },
  pruneUnused: async () => {
    const res = await window.wslcApi.pruneImages()
    await get().refresh()
    if (res.ok) toast.success('Imagens sem uso removidas.')
    else toast.danger(res.stderr || res.stdout || 'Falha ao remover as imagens sem uso.')
  },
  removeAll: async () => {
    const all = await window.wslcApi.listImages()
    if (all.length === 0) {
      toast.info('Nenhuma imagem para remover.')
      return
    }
    let failures = 0
    // Sequencial de propósito: não sobrecarregar a CLI do wslc.
    // oxlint-disable no-await-in-loop
    for (const image of all) {
      const res = await window.wslcApi.removeImage(refOf(image))
      if (!res.ok) failures++
    }
    // oxlint-enable no-await-in-loop
    await get().refresh()
    if (failures === 0) toast.success(`${all.length} imagem(ns) removida(s).`)
    else toast.danger(`Falha ao remover ${failures} de ${all.length} imagens.`)
  }
}))
