import { useEffect, useState } from 'react'
import { FolderOpen, Play, SlidersHorizontal, SquareTerminal } from 'lucide-react'
import type { ContainerInfo, ExecOptions } from '@shared/schemas'
import { prettyInspect } from '@/components/inspect-sheet'
import Sparkline from '@/components/sparkline'
import {
  AppSheet,
  BareInput,
  Button,
  IconAction,
  IconToggle,
  Mono,
  Skeleton,
  StateChip,
  SwitchInput,
  TextInput
} from '@/design'
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
  // Opções do `wslc exec`. Ficam atrás de um botão porque o caso comum é
  // rodar um comando e ler a saída — não configurar o ambiente dele.
  const [showExecOptions, setShowExecOptions] = useState(false)
  const [execUser, setExecUser] = useState('')
  const [execWorkdir, setExecWorkdir] = useState('')
  const [execEnv, setExecEnv] = useState('')
  const [execEnvFile, setExecEnvFile] = useState('')
  const [execDetach, setExecDetach] = useState(false)

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

  const pickEnvFile = async (): Promise<void> => {
    const path = await window.wslcApi.pickFile('Arquivo de variáveis (KEY=valor por linha)', ['env', '*'])
    if (path) setExecEnvFile(path)
  }

  const runExec = async (): Promise<void> => {
    const cmd = command.trim()
    if (!cmd || execRunning) return
    setExecRunning(true)
    try {
      // No motor nativo o SDK só tem diretório de trabalho e variáveis: as
      // outras opções nem são oferecidas, para não prometer o que não faz.
      const opts: ExecOptions = {
        workdir: execWorkdir.trim() || undefined,
        env: execEnv
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
        ...(nativeEngine
          ? {}
          : {
              user: execUser.trim() || undefined,
              envFile: execEnvFile.trim() || undefined,
              detach: execDetach || undefined
            })
      }
      const res = await window.wslcApi.execInContainer(container.id || container.name, cmd, opts)
      setExecOutput(
        opts.detach
          ? '(iniciado em segundo plano: a saída fica no log do container)'
          : res.stdout || res.stderr || `(sem saída, código ${res.code})`
      )
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
            <IconToggle isSelected={showExecOptions} label="Opções do exec" onChange={setShowExecOptions}>
              <SlidersHorizontal className="size-4" />
            </IconToggle>
            <Button isDisabled={execRunning || !command.trim()} size="sm" onPress={() => void runExec()}>
              <Play className="size-4" />
              {execRunning ? 'Rodando…' : 'Exec'}
            </Button>
          </div>

          {showExecOptions && (
            <div className="field-group flex flex-col gap-3 px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  hint="Diretório de onde o comando roda dentro do container (-w)."
                  label="Diretório de trabalho"
                  placeholder="ex.: /app"
                  value={execWorkdir}
                  onChange={setExecWorkdir}
                />
                <TextInput
                  isDisabled={nativeEngine}
                  hint={
                    nativeEngine
                      ? 'O SDK nativo não escolhe o usuário do processo — recurso do motor CLI.'
                      : 'Nome, uid ou uid:gid com que o comando roda (-u).'
                  }
                  label="Usuário"
                  placeholder="ex.: 1000:1000"
                  value={execUser}
                  onChange={setExecUser}
                />
              </div>
              <TextInput
                hint="Pares CHAVE=valor separados por vírgula (-e)."
                label="Variáveis de ambiente"
                placeholder="ex.: DEBUG=1, TZ=Etc/UTC"
                value={execEnv}
                onChange={setExecEnv}
              />
              {!nativeEngine && (
                <>
                  <div className="flex items-end gap-2">
                    <TextInput
                      className="flex-1"
                      hint="Arquivo com uma variável KEY=valor por linha (--env-file)."
                      label="Arquivo de variáveis"
                      placeholder="ex.: C:\projeto\.env"
                      value={execEnvFile}
                      onChange={setExecEnvFile}
                    />
                    <IconAction
                      label="Escolher arquivo"
                      variant="secondary"
                      onPress={() => void pickEnvFile()}
                    >
                      <FolderOpen className="size-4" />
                    </IconAction>
                  </div>
                  <SwitchInput
                    hint="Não espera o comando terminar (-d): nenhuma saída volta para cá."
                    isSelected={execDetach}
                    label="Rodar em segundo plano"
                    onChange={setExecDetach}
                  />
                </>
              )}
            </div>
          )}
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
