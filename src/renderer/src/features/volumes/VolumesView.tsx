import { useEffect, useState } from 'react'
import { EllipsisVertical, Eraser, HardDrive, Info, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { VolumeInfo } from '@shared/schemas'
import { formatBytes } from '@shared/format'
import InspectSheet from '@/components/inspect-sheet'
import {
  Button,
  Cell,
  Column,
  DataTable,
  Dropdown,
  Empty,
  ErrorAlert,
  IconAction,
  Label,
  Mono,
  PageBody,
  PageHeader,
  PageShell,
  Row,
  StateChip,
  Tooltip
} from '@/design'
import { usePolling } from '@/hooks/usePolling'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import CreateVolumeDialog from './CreateVolumeDialog'
import { useVolumesStore } from './store'

export default function VolumesView(): React.JSX.Element {
  const volumes = useVolumesStore((s) => s.volumes)
  const error = useVolumesStore((s) => s.error)
  const refresh = useVolumesStore((s) => s.refresh)
  const removeVolume = useVolumesStore((s) => s.remove)
  const pruneUnused = useVolumesStore((s) => s.pruneUnused)
  const removeAll = useVolumesStore((s) => s.removeAll)
  const [showCreate, setShowCreate] = useState(false)
  const [inspecting, setInspecting] = useState<VolumeInfo | null>(null)
  const engineStatus = useEngineStore((s) => s.status)
  const loadEngine = useEngineStore((s) => s.load)
  const engine = engineStatus?.engine
  const nativeEngine = engine === 'native'

  usePolling(refresh, 10_000)

  useEffect(() => {
    void loadEngine()
  }, [loadEngine])

  // Trocou o motor em Sistema → a lista vem de outra sessão; recarrega na hora.
  useEffect(() => {
    if (engine) void refresh()
  }, [engine, refresh])

  const remove = async (vol: VolumeInfo): Promise<void> => {
    const ok = await confirmDialog({
      title: `Remover o volume "${vol.name}"?`,
      description: 'Os dados armazenados nele serão perdidos permanentemente.',
      confirmLabel: 'Remover',
      destructive: true
    })
    if (ok) void removeVolume(vol.name)
  }

  const removeUnused = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover volumes sem uso?',
      description: 'Volumes não utilizados por nenhum container serão removidos, com seus dados.',
      confirmLabel: 'Remover sem uso',
      destructive: true
    })
    if (ok) void pruneUnused()
  }

  const removeEverything = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover TODOS os volumes?',
      description: 'Todos os volumes e seus dados serão perdidos permanentemente.',
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
            <IconAction label="Atualizar" variant="secondary" onPress={() => void refresh()}>
              <RefreshCw className="size-4" />
            </IconAction>
            <Dropdown>
              <Button aria-label="Mais ações" isIconOnly size="sm" variant="secondary">
                <EllipsisVertical className="size-4" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu>
                  {!nativeEngine && (
                    <Dropdown.Item
                      id="prune"
                      textValue="Remover volumes sem uso"
                      onAction={() => void removeUnused()}
                    >
                      <Eraser className="size-4" />
                      <Label>Remover volumes sem uso</Label>
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item
                    id="remove-all"
                    textValue="Remover todos os volumes"
                    variant="danger"
                    onAction={() => void removeEverything()}
                  >
                    <Trash2 className="size-4" />
                    <Label>Remover todos os volumes</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <IconAction label="Criar volume" variant="primary" onPress={() => setShowCreate(true)}>
              <Plus className="size-4" />
            </IconAction>
          </>
        }
        description="Volumes nomeados persistem dados entre execuções. Anexe um na aba Volumes ao executar um container."
        meta={
          nativeEngine ? (
            <Tooltip delay={300}>
              <Tooltip.Trigger>
                <StateChip label="motor nativo" tone="accent" />
              </Tooltip.Trigger>
              <Tooltip.Content>
                Volumes VHDX da sessão nativa &quot;WslcUi&quot; (WslcCreateSessionVhdVolume): tamanho, tipo e
                dono (uid/gid). Volumes &quot;guest&quot; auto-criados ao anexar um nome inexistente num
                container não são enumeráveis pelo SDK e não aparecem aqui.
              </Tooltip.Content>
            </Tooltip>
          ) : undefined
        }
        title="Volumes"
      />

      <PageBody className="min-h-0 flex-1">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <DataTable
          ariaLabel="Volumes"
          emptyState={
            <Empty
              description="Crie um agora ou anexe um volume ao executar um container."
              icon={<HardDrive />}
              title="Nenhum volume"
            />
          }
          fill
          footer={
            nativeEngine ? (
              <span>
                No motor nativo, anexar um nome que não existe cria um volume “guest”: ele persiste, mas não
                aparece nesta lista (o SDK não enumera esse tipo).
              </span>
            ) : (
              <span>
                {volumes.length} {volumes.length === 1 ? 'volume' : 'volumes'}
              </span>
            )
          }
          head={
            <>
              <Column isRowHeader>Nome</Column>
              <Column>Driver</Column>
              <Column>Mountpoint</Column>
              <Column>{nativeEngine ? 'Tamanho' : 'Escopo'}</Column>
              <Column width={110}>Ações</Column>
            </>
          }
        >
          {volumes.map((vol) => (
            <Row key={vol.name} id={vol.name}>
              <Cell>
                <Mono>{vol.name}</Mono>
              </Cell>
              <Cell>{vol.driver || '-'}</Cell>
              <Cell>
                <Mono className="text-muted">{vol.mountpoint || '-'}</Mono>
              </Cell>
              <Cell>
                {nativeEngine
                  ? vol.sizeBytes !== undefined
                    ? formatBytes(vol.sizeBytes)
                    : '-'
                  : vol.scope || '-'}
              </Cell>
              <Cell>
                <div className="flex items-center justify-end gap-0.5">
                  <IconAction label="Inspecionar volume" onPress={() => setInspecting(vol)}>
                    <Info className="size-4" />
                  </IconAction>
                  <IconAction label="Remover volume" variant="danger-soft" onPress={() => void remove(vol)}>
                    <Trash2 className="size-4" />
                  </IconAction>
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      </PageBody>

      {showCreate && (
        <CreateVolumeDialog
          nativeEngine={nativeEngine}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false)
            void refresh()
          }}
        />
      )}

      {inspecting && (
        <InspectSheet
          description={
            nativeEngine ? 'Metadados do arquivo .vhdx da sessão nativa.' : 'Saída do wslc volume inspect.'
          }
          load={() => window.wslcApi.inspectVolume(inspecting.name)}
          title={`Volume ${inspecting.name}`}
          onClose={() => setInspecting(null)}
        />
      )}
    </PageShell>
  )
}
