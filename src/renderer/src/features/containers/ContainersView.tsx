import { useEffect, useState } from 'react'
import {
  Container as ContainerIcon,
  EllipsisVertical,
  Eraser,
  ExternalLink,
  Eye,
  FileArchive,
  Globe,
  Info,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Skull,
  Square,
  SquareTerminal,
  Trash2
} from 'lucide-react'
import type { ContainerInfo, ContainerState } from '@shared/schemas'
import {
  Button,
  Cell,
  Column,
  DataTable,
  Dropdown,
  Empty,
  ErrorAlert,
  IconAction,
  IconToggle,
  Label,
  Metric,
  Mono,
  PageBody,
  PageHeader,
  PageShell,
  Row,
  StateChip,
  StateDot,
  Tooltip
} from '@/design'
import { usePolling } from '@/hooks/usePolling'
import { firstHostPort } from '@/lib/ports'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import { statsFor, useStatsStore } from '@/stores/stats-store'
import { useStreamStore } from '@/stores/stream-store'
import ContainerDetailsSheet from './ContainerDetailsSheet'
import RunDialog from './RunDialog'
import TerminalSheet from './TerminalSheet'
import { useContainersStore } from './store'

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATE_TONE: Record<ContainerState, Tone> = {
  running: 'success',
  exited: 'danger',
  created: 'warning',
  unknown: 'default'
}

export default function ContainersView(): React.JSX.Element {
  const engineStatus = useEngineStore((s) => s.status)
  const loadEngine = useEngineStore((s) => s.load)
  const engine = engineStatus?.engine
  const nativeEngine = engine === 'native'
  const containers = useContainersStore((s) => s.containers)
  const showAll = useContainersStore((s) => s.showAll)
  const error = useContainersStore((s) => s.error)
  const busyId = useContainersStore((s) => s.busyId)
  const setShowAll = useContainersStore((s) => s.setShowAll)
  const refresh = useContainersStore((s) => s.refresh)
  const applyAction = useContainersStore((s) => s.applyAction)
  const killContainer = useContainersStore((s) => s.kill)
  const exportFs = useContainersStore((s) => s.exportFs)
  const pruneStopped = useContainersStore((s) => s.pruneStopped)
  const removeAll = useContainersStore((s) => s.removeAll)
  const openStream = useStreamStore((s) => s.open)
  const statsById = useStatsStore((s) => s.byId)
  const refreshStats = useStatsStore((s) => s.refresh)
  const [showRun, setShowRun] = useState(false)
  const [details, setDetails] = useState<ContainerInfo | null>(null)
  const [terminal, setTerminal] = useState<ContainerInfo | null>(null)

  usePolling(refresh, 5000, showAll)
  usePolling(refreshStats, 3000)

  useEffect(() => {
    void loadEngine()
  }, [loadEngine])

  // Trocou o motor em Sistema → a lista vem de outra sessão; recarrega na hora.
  useEffect(() => {
    if (engine) void refresh()
  }, [engine, refresh])

  const remove = async (c: ContainerInfo): Promise<void> => {
    const label = c.name || c.id.slice(0, 12)
    const ok = await confirmDialog({
      title: `Remover o container "${label}"?`,
      description: 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      destructive: true
    })
    if (ok) void applyAction('remove', c)
  }

  const kill = async (c: ContainerInfo): Promise<void> => {
    const label = c.name || c.id.slice(0, 12)
    const ok = await confirmDialog({
      title: `Encerrar "${label}" com SIGKILL?`,
      description: 'O processo morre na hora, sem desligamento gracioso (use Parar para SIGTERM).',
      confirmLabel: 'Forçar encerramento',
      destructive: true
    })
    if (ok) void killContainer(c)
  }

  const removeStopped = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover containers parados?',
      description: 'Todos os containers que não estão em execução serão removidos.',
      confirmLabel: 'Remover parados',
      destructive: true
    })
    if (ok) void pruneStopped()
  }

  const removeEverything = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover TODOS os containers?',
      description: 'Containers em execução serão parados e removidos. Essa ação não pode ser desfeita.',
      confirmLabel: 'Remover tudo',
      destructive: true
    })
    if (ok) void removeAll()
  }

  return (
    <PageShell fill>
      <PageHeader
        actions={
          <>
            <IconToggle isSelected={showAll} label="Mostrar parados" onChange={setShowAll}>
              <Eye className="size-4" />
            </IconToggle>
            <IconAction label="Atualizar" variant="secondary" onPress={() => void refresh()}>
              <RefreshCw className="size-4" />
            </IconAction>
            <Dropdown>
              <Button aria-label="Mais ações" isIconOnly size="sm" variant="secondary">
                <EllipsisVertical className="size-4" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu>
                  <Dropdown.Item
                    id="prune"
                    textValue="Remover containers parados"
                    onAction={() => void removeStopped()}
                  >
                    <Eraser className="size-4" />
                    <Label>Remover containers parados</Label>
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="remove-all"
                    textValue="Remover todos os containers"
                    variant="danger"
                    onAction={() => void removeEverything()}
                  >
                    <Trash2 className="size-4" />
                    <Label>Remover todos os containers</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <IconAction label="Executar container" variant="primary" onPress={() => setShowRun(true)}>
              <Plus className="size-4" />
            </IconAction>
          </>
        }
        meta={
          nativeEngine ? (
            <Tooltip delay={300}>
              <Tooltip.Trigger>
                <StateChip label="motor nativo" tone="accent" />
              </Tooltip.Trigger>
              <Tooltip.Content>
                Containers gerenciados pela sessão nativa &quot;WslcUi&quot; (wslcsdk via FFI). Eles são
                removidos quando o app fecha: o SDK preview não permite reabrir handles.
              </Tooltip.Content>
            </Tooltip>
          ) : undefined
        }
        title="Containers"
      />

      <PageBody className="min-h-0 flex-1">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <DataTable
          ariaLabel="Containers"
          emptyState={
            <Empty
              description="Nenhum container encontrado nesta sessão. Suba um a partir de uma imagem local ou do catálogo."
              icon={<ContainerIcon />}
              title="Sem containers"
            />
          }
          fill
          footer={
            <span>
              {containers.length} {containers.length === 1 ? 'container' : 'containers'}
              {showAll ? ' (incluindo parados)' : ' em execução'}
            </span>
          }
          head={
            <>
              <Column isRowHeader>Nome</Column>
              <Column>Imagem</Column>
              <Column>Status</Column>
              <Column width={110}>CPU</Column>
              <Column width={110}>Memória</Column>
              <Column>Portas</Column>
              <Column width={150}>Ações</Column>
            </>
          }
        >
          {containers.map((c) => {
            const stats = c.state === 'running' ? statsFor(statsById, c) : undefined
            const hostPort = c.state === 'running' ? firstHostPort(c.ports) : null
            return (
              <Row key={c.id || c.name} id={c.id || c.name}>
                <Cell>
                  <button
                    className="flex items-center gap-2 rounded-sm hover:underline"
                    title="Ver detalhes"
                    onClick={() => setDetails(c)}
                  >
                    <StateDot tone={STATE_TONE[c.state]} />
                    {c.name || <span className="text-muted">{c.id.slice(0, 12)}</span>}
                  </button>
                </Cell>
                <Cell>
                  <Mono>{c.image}</Mono>
                </Cell>
                <Cell>
                  <StateChip label={c.status} tone={STATE_TONE[c.state]} />
                </Cell>
                <Cell>
                  <Metric
                    ariaLabel={`CPU de ${c.name || c.id}`}
                    label={stats ? `${stats.cpuPercent.toFixed(1)}%` : '-'}
                    percent={stats?.cpuPercent}
                  />
                </Cell>
                <Cell>
                  <Metric
                    ariaLabel={`Memória de ${c.name || c.id}`}
                    label={stats ? `${stats.memPercent.toFixed(1)}%` : '-'}
                    percent={stats?.memPercent}
                  />
                </Cell>
                <Cell>
                  <span className="flex items-center gap-1.5">
                    <Mono>{c.ports || '-'}</Mono>
                    {hostPort !== null && (
                      <IconAction
                        label={`Abrir localhost:${hostPort}`}
                        onPress={() => void window.wslcApi.openExternal(`http://localhost:${hostPort}`)}
                      >
                        <Globe className="size-3.5" />
                      </IconAction>
                    )}
                  </span>
                </Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-0.5">
                    {c.state === 'running' ? (
                      <IconAction
                        isDisabled={busyId === c.id}
                        label="Parar"
                        onPress={() => void applyAction('stop', c)}
                      >
                        <Square className="size-4" />
                      </IconAction>
                    ) : (
                      <IconAction
                        isDisabled={busyId === c.id}
                        label="Iniciar"
                        onPress={() => void applyAction('start', c)}
                      >
                        <Play className="size-4" />
                      </IconAction>
                    )}
                    <IconAction
                      label="Logs"
                      onPress={() =>
                        void openStream(`Logs de ${c.name || c.id.slice(0, 12)}`, () =>
                          window.wslcApi.streamLogs(c.id || c.name)
                        )
                      }
                    >
                      <ScrollText className="size-4" />
                    </IconAction>
                    {c.state === 'running' && (
                      <IconAction label="Terminal" onPress={() => setTerminal(c)}>
                        <SquareTerminal className="size-4" />
                      </IconAction>
                    )}
                    <Dropdown>
                      <Button aria-label="Mais ações do container" isIconOnly size="sm" variant="ghost">
                        <EllipsisVertical className="size-4" />
                      </Button>
                      <Dropdown.Popover>
                        <Dropdown.Menu>
                          <Dropdown.Item id="details" textValue="Detalhes" onAction={() => setDetails(c)}>
                            <Info className="size-4" />
                            <Label>Detalhes</Label>
                          </Dropdown.Item>
                          <Dropdown.Item
                            id="restart"
                            isDisabled={c.state !== 'running' || busyId === c.id}
                            textValue="Reiniciar"
                            onAction={() => void applyAction('restart', c)}
                          >
                            <RotateCcw className="size-4" />
                            <Label>Reiniciar</Label>
                          </Dropdown.Item>
                          {c.state === 'running' && !nativeEngine && (
                            <Dropdown.Item
                              id="external-terminal"
                              textValue="Terminal externo"
                              onAction={() => void window.wslcApi.openContainerTerminal(c.id || c.name)}
                            >
                              <ExternalLink className="size-4" />
                              <Label>Terminal externo</Label>
                            </Dropdown.Item>
                          )}
                          {!nativeEngine && (
                            // A CLI recusa exportar container EM EXECUÇÃO: só habilita parado.
                            <Dropdown.Item
                              id="export"
                              isDisabled={c.state === 'running' || busyId === c.id}
                              textValue="Exportar filesystem"
                              onAction={() => void exportFs(c)}
                            >
                              <FileArchive className="size-4" />
                              <Label>Exportar filesystem…</Label>
                            </Dropdown.Item>
                          )}
                          {c.state === 'running' && (
                            <Dropdown.Item
                              id="kill"
                              isDisabled={busyId === c.id}
                              textValue="Forçar encerramento"
                              variant="danger"
                              onAction={() => void kill(c)}
                            >
                              <Skull className="size-4" />
                              <Label>Forçar encerramento</Label>
                            </Dropdown.Item>
                          )}
                          <Dropdown.Item
                            id="remove"
                            isDisabled={busyId === c.id}
                            textValue="Remover"
                            variant="danger"
                            onAction={() => void remove(c)}
                          >
                            <Trash2 className="size-4" />
                            <Label>Remover</Label>
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </div>
                </Cell>
              </Row>
            )
          })}
        </DataTable>
      </PageBody>

      {showRun && (
        <RunDialog
          onClose={() => setShowRun(false)}
          onDone={() => {
            setShowRun(false)
            void refresh()
          }}
        />
      )}

      {details && <ContainerDetailsSheet container={details} onClose={() => setDetails(null)} />}

      {terminal && <TerminalSheet container={terminal} onClose={() => setTerminal(null)} />}
    </PageShell>
  )
}
