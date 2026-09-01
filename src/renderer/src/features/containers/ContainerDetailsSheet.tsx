import { useEffect, useState } from 'react'
import { Play, SquareTerminal } from 'lucide-react'
import type { ContainerInfo } from '@shared/schemas'
import { prettyInspect } from '@/components/inspect-sheet'
import Sparkline from '@/components/sparkline'
import { AppSheet, BareInput, Button, Mono, Skeleton, StateChip } from '@/design'
import { useEngineStore } from '@/stores/engine-store'
import { statsFor, useStatsStore } from '@/stores/stats-store'

interface Props {
  container: ContainerInfo
  onClose: () => void
}

function MetricCard({
  title,
  value,
  samples,
  color,
  max
}: {
  title: string
  value: string
  samples: number[]
  color: string
  max?: number
}): React.JSX.Element {
  return (
    <div className="inset-well p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{title}</span>
        <span className="font-mono text-sm">{value}</span>
      </div>
      {samples.length > 1 ? (
        <Sparkline color={color} data={samples} height={56} max={max} />
      ) : (
        <div className="pt-2 text-xs text-muted">coletando métricas…</div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

export default function ContainerDetailsSheet({ container, onClose }: Props): React.JSX.Element {
  // O terminal externo (wslc exec) não alcança a sessão nativa do app: nesse
  // motor só existe o terminal embutido (botão na linha do container).
  const nativeEngine = useEngineStore((s) => s.status?.engine === 'native')
  const byId = useStatsStore((s) => s.byId)
  const history = useStatsStore((s) => s.history)
  const stats = statsFor(byId, container)
  const samples = history[container.id] ?? history[stats?.id ?? ''] ?? []

  const [inspect, setInspect] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [execOutput, setExecOutput] = useState<string | null>(null)
  const [execRunning, setExecRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.wslcApi
      .inspectContainer(container.id || container.name)
      .then((res) => !cancelled && setInspect(prettyInspect(res)))
      .catch((e) => !cancelled && setInspect(String(e)))
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- carrega uma vez ao abrir
  }, [])

  const runExec = async (): Promise<void> => {
    const cmd = command.trim()
    if (!cmd || execRunning) return
    setExecRunning(true)
    try {
      const res = await window.wslcApi.execInContainer(container.id || container.name, cmd)
      setExecOutput(res.stdout || res.stderr || `(sem saída, código ${res.code})`)
    } finally {
      setExecRunning(false)
    }
  }

  const running = container.state === 'running'

  return (
    <AppSheet
      bodyClassName="flex flex-col gap-5 overflow-y-auto scrollbar"
      description={container.image}
      title={container.name || container.id.slice(0, 12)}
      width="w-[min(40rem,92vw)]"
      onClose={onClose}
    >
      <StateChip
        className="w-fit"
        label={container.status || container.state}
        tone={running ? 'success' : 'default'}
      />

      {running && (
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <MetricCard
            color="var(--accent)"
            samples={samples.map((s) => s.cpu)}
            title="CPU"
            value={stats ? `${stats.cpuPercent.toFixed(1)}%` : '-'}
          />
          <MetricCard
            color="var(--success)"
            max={100}
            samples={samples.map((s) => s.mem)}
            title="Memória"
            value={stats ? stats.memUsage : '-'}
          />
        </div>
      )}

      {running && !nativeEngine && (
        <Button
          className="w-fit"
          size="sm"
          variant="secondary"
          onPress={() => void window.wslcApi.openContainerTerminal(container.id || container.name)}
        >
          <SquareTerminal className="size-4" />
          Abrir terminal externo
        </Button>
      )}

      {running && (
        <Section title="Executar comando no container">
          <div className="flex gap-2">
            <BareInput
              ariaLabel="Comando a executar"
              className="font-mono"
              placeholder="ex.: cat /etc/os-release"
              value={command}
              onChange={setCommand}
            />
            <Button isDisabled={execRunning || !command.trim()} size="sm" onPress={() => void runExec()}>
              <Play className="size-4" />
              {execRunning ? 'Rodando…' : 'Exec'}
            </Button>
          </div>
          {execOutput !== null && (
            <pre className="inset-well max-h-48 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">
              {execOutput}
            </pre>
          )}
        </Section>
      )}

      <Section title="Inspect">
        {inspect === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <pre className="inset-well overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
            {inspect}
          </pre>
        )}
      </Section>

      <Mono className="text-muted">{container.id}</Mono>
    </AppSheet>
  )
}
