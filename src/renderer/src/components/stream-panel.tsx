import { useEffect, useRef } from 'react'
import { formatBytes } from '@shared/format'
import type { ImageProgressLayer, ImageProgressStatus } from '@shared/schemas'
import { Button, ProgressBar, StateDot } from '@/design'
import { cn } from '@/lib/utils'
import { useStreamStore } from '@/stores/stream-store'

const STATUS_LABELS: Record<ImageProgressStatus, string> = {
  unknown: 'Sem status',
  pulling: 'Preparando',
  waiting: 'Aguardando',
  downloading: 'Baixando',
  verifying: 'Verificando',
  extracting: 'Extraindo',
  complete: 'Concluído',
  uploading: 'Enviando'
}

function layerPercent(layer: ImageProgressLayer): number {
  if (layer.status === 'complete') return 100
  if (layer.total <= 0) return 0
  return Math.min(100, (layer.current / layer.total) * 100)
}

function LayerRow({ layer }: { layer: ImageProgressLayer }): React.JSX.Element {
  const done = layer.status === 'complete'
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 truncate font-mono text-muted">{layer.id}</span>
      <ProgressBar
        aria-label={`Camada ${layer.id}`}
        className="flex-1"
        color={done ? 'success' : 'accent'}
        size="sm"
        value={layerPercent(layer)}
      >
        <ProgressBar.Track className="h-1.5">
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <span className={cn('w-44 shrink-0 text-right', done ? 'text-success' : 'text-muted')}>
        {STATUS_LABELS[layer.status]}
        {layer.total > 0 && !done && ` · ${formatBytes(layer.current)} / ${formatBytes(layer.total)}`}
      </span>
    </div>
  )
}

/** Painel de progresso de operações longas (pull, push, build, logs ao vivo). */
export default function StreamPanel(): React.JSX.Element | null {
  const stream = useStreamStore((s) => s.stream)
  const close = useStreamStore((s) => s.close)
  const preRef = useRef<HTMLPreElement>(null)

  const output = stream?.output
  useEffect(() => {
    const el = preRef.current
    if (el) el.scrollTop = el.scrollHeight
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- rola para o fim a cada saída nova
  }, [output])

  if (!stream) return null

  const hasLayers = stream.layers.length > 0

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-separator">
      <header className="flex items-center gap-2.5 border-b border-separator px-4 py-2 text-sm">
        <StateDot tone={stream.running ? 'success' : 'danger'} />
        <strong className="font-medium">{stream.title}</strong>
        {!stream.running && <span className="text-muted">finalizado (código {stream.exitCode ?? '?'})</span>}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onPress={() => void close()}>
          {stream.running ? 'Parar e fechar' : 'Fechar'}
        </Button>
      </header>

      {hasLayers && (
        <div className="flex max-h-40 shrink-0 flex-col gap-1.5 overflow-y-auto border-b border-separator px-4 py-2.5 scrollbar">
          {stream.layers.map((layer) => (
            <LayerRow key={layer.id} layer={layer} />
          ))}
        </div>
      )}

      <pre
        ref={preRef}
        className="flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed text-muted scrollbar"
      >
        {stream.output || (stream.running ? 'Aguardando saída…' : '(sem saída)')}
      </pre>
    </section>
  )
}
