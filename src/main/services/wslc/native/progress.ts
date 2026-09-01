import type { ImageProgressLayer, ImageProgressStatus } from '@shared/schemas'
import type { RawProgressMessage } from './bindings'

/**
 * Progresso estruturado de pull/push (Fases 4 e 5): o SDK entrega uma
 * WslcImageProgressMessage por transição de camada (pulling → downloading
 * com bytes → complete → extracting → complete) e uma mensagem final com id
 * vazio. No PUSH o campo status vem sempre 0 (unknown) — o estágio é
 * derivado dos bytes (modo 'push'). Este módulo é puro — o acúmulo/ordenação
 * é testável sem FFI.
 */

const STATUSES: ImageProgressStatus[] = [
  'unknown',
  'pulling',
  'waiting',
  'downloading',
  'verifying',
  'extracting',
  'complete'
]

export function mapProgressStatus(status: number): ImageProgressStatus {
  return STATUSES[status] ?? 'unknown'
}

/** Acumula as mensagens do callback em um snapshot ordenado por camada. */
export class ProgressTracker {
  private readonly layers = new Map<string, ImageProgressLayer>()
  private readonly skipIds: Set<string>
  private readonly mode: 'pull' | 'push'

  /** @param skipIds ids que não são camadas (a 1ª mensagem do pull usa a TAG como id). */
  constructor(skipIds: string[] = [], mode: 'pull' | 'push' = 'pull') {
    this.skipIds = new Set(skipIds)
    this.mode = mode
  }

  /**
   * @returns true se o snapshot mudou. A mensagem final de id vazio (conclusão
   * geral) não vira camada — o fim do pull é sinalizado pelo exit do stream.
   */
  update(msg: RawProgressMessage): boolean {
    const id = (msg.id ?? '').trim()
    if (!id || this.skipIds.has(id)) return false
    let status = mapProgressStatus(msg.status)
    const prev = this.layers.get(id)
    if (this.mode === 'push' && status === 'unknown') {
      // Push: 0/0 antes dos bytes = camada aguardando; com bytes = enviando;
      // 0/0 depois dos bytes = camada concluída (o SDK zera os contadores).
      if (msg.detail.currentBytes > 0 || msg.detail.totalBytes > 0) status = 'uploading'
      else status = prev !== undefined && prev.total > 0 ? 'complete' : 'waiting'
    }
    // 'complete' chega com bytes zerados — mantém o total anterior para a barra encher.
    const keepPrev = status === 'complete' && prev !== undefined && prev.total > 0
    this.layers.set(id, {
      id,
      status,
      current: keepPrev ? prev.total : Math.round(msg.detail.currentBytes),
      total: keepPrev ? prev.total : Math.round(msg.detail.totalBytes)
    })
    return true
  }

  snapshot(): ImageProgressLayer[] {
    return [...this.layers.values()]
  }
}
