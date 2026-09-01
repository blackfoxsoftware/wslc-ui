import { formatBytes } from '@shared/format'
import type { ImageInfo } from '@shared/schemas'

export { formatBytes }

/** WslcImageInfo decodificada pelo koffi (ver `WslcSdk.decodeImages`). */
export interface RawNativeImage {
  name: string
  sha256: ArrayLike<number>
  sizeBytes: number
  createdUnixTime: number
}

/** Separa "repo:tag" respeitando registries com porta ("localhost:5000/app"). */
export function splitImageRef(ref: string): { repository: string; tag: string } {
  const colon = ref.lastIndexOf(':')
  if (colon > ref.lastIndexOf('/') && colon > 0) {
    return { repository: ref.slice(0, colon), tag: ref.slice(colon + 1) }
  }
  return { repository: ref, tag: '' }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "dd/mm/aaaa hh:mm" no fuso local (a CLI mostra texto relativo; aqui é absoluto). */
export function formatUnixDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Converte a WslcImageInfo nativa para o shape compartilhado da UI. */
export function mapNativeImage(raw: RawNativeImage): ImageInfo {
  const { repository, tag } = splitImageRef(raw.name)
  return {
    repository,
    tag,
    id: Buffer.from(Array.from(raw.sha256)).toString('hex').slice(0, 12),
    created: formatUnixDate(raw.createdUnixTime),
    size: formatBytes(raw.sizeBytes)
  }
}
