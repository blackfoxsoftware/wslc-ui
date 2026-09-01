import { useEffect, useState } from 'react'
import { EllipsisVertical, Eraser, Info, Network, Plug, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react'
import type { NetworkInfo } from '@shared/schemas'
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
  Notice,
  PageBody,
  PageHeader,
  PageShell,
  Row
} from '@/design'
import { usePolling } from '@/hooks/usePolling'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import ConnectContainerDialog from './ConnectContainerDialog'
import CreateNetworkDialog from './CreateNetworkDialog'
import { useNetworksStore } from './store'

export default function NetworksView(): React.JSX.Element {
  const networks = useNetworksStore((s) => s.networks)
  const error = useNetworksStore((s) => s.error)
  const refresh = useNetworksStore((s) => s.refresh)
  const removeNetwork = useNetworksStore((s) => s.remove)
  const pruneUnused = useNetworksStore((s) => s.pruneUnused)
  const engineStatus = useEngineStore((s) => s.status)
  const loadEngine = useEngineStore((s) => s.load)
  const nativeEngine = engineStatus?.engine === 'native'
  const [showCreate, setShowCreate] = useState(false)
  const [inspecting, setInspecting] = useState<NetworkInfo | null>(null)
  const [connecting, setConnecting] = useState<{ network: string; mode: 'connect' | 'disconnect' } | null>(
    null
  )

  usePolling(refresh, 10_000)

  useEffect(() => {
    void loadEngine()
  }, [loadEngine])

  const remove = async (net: NetworkInfo): Promise<void> => {
    const ok = await confirmDialog({
      title: `Remover a rede "${net.name}"?`,
      description: 'Redes com containers conectados não podem ser removidas.',
      confirmLabel: 'Remover',
      destructive: true
    })
    if (ok) void removeNetwork(net.name)
  }

  const removeUnused = async (): Promise<void> => {
    // A CLI apaga direto (network prune não tem confirmação): confirmamos aqui.
    const ok = await confirmDialog({
      title: 'Remover redes sem uso?',
      description: 'Toda rede sem nenhum container conectado será removida.',
      confirmLabel: 'Remover sem uso',
      destructive: true
    })
    if (ok) void pruneUnused()
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
                  <Dropdown.Item
                    id="prune"
                    textValue="Remover redes sem uso"
                    variant="danger"
                    onAction={() => void removeUnused()}
                  >
                    <Eraser className="size-4" />
                    <Label>Remover redes sem uso</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <IconAction label="Criar rede" variant="primary" onPress={() => setShowCreate(true)}>
              <Plus className="size-4" />
            </IconAction>
          </>
        }
        description="Containers na mesma rede se alcançam pelo nome. Na aba Rede & Ambiente do run, dá para já subir conectado."
        title="Redes"
      />

      <PageBody className="min-h-0 flex-1">
        {nativeEngine && (
          <Notice title="Redes nomeadas são um recurso da CLI">
            Containers do motor nativo usam sempre a rede bridge (NAT) do WSL: o SDK preview não expõe redes
            nomeadas. As redes abaixo valem para containers criados no motor CLI.
          </Notice>
        )}
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <DataTable
          ariaLabel="Redes"
          emptyState={
            <Empty
              description="Crie uma rede para os containers conversarem entre si pelo nome, isolados da bridge padrão."
              icon={<Network />}
              title="Nenhuma rede"
            />
          }
          fill
          footer={
            <span>
              {networks.length} {networks.length === 1 ? 'rede' : 'redes'}
            </span>
          }
          head={
            <>
              <Column isRowHeader>Nome</Column>
              <Column>ID</Column>
              <Column>Driver</Column>
              <Column width={110}>Ações</Column>
            </>
          }
        >
          {networks.map((net) => (
            <Row key={net.id || net.name} id={net.id || net.name}>
              <Cell>
                <Mono>{net.name}</Mono>
              </Cell>
              <Cell>
                <Mono className="text-muted">{net.id}</Mono>
              </Cell>
              <Cell>{net.driver || '-'}</Cell>
              <Cell>
                <div className="flex items-center justify-end gap-0.5">
                  <IconAction label="Inspecionar rede" onPress={() => setInspecting(net)}>
                    <Info className="size-4" />
                  </IconAction>
                  <Dropdown>
                    <Button aria-label="Mais ações da rede" isIconOnly size="sm" variant="ghost">
                      <EllipsisVertical className="size-4" />
                    </Button>
                    <Dropdown.Popover>
                      <Dropdown.Menu>
                        <Dropdown.Item
                          id="connect"
                          textValue="Conectar container"
                          onAction={() => setConnecting({ network: net.name, mode: 'connect' })}
                        >
                          <Plug className="size-4" />
                          <Label>Conectar container…</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                          id="disconnect"
                          textValue="Desconectar container"
                          onAction={() => setConnecting({ network: net.name, mode: 'disconnect' })}
                        >
                          <Unplug className="size-4" />
                          <Label>Desconectar container…</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                          id="remove"
                          textValue="Remover"
                          variant="danger"
                          onAction={() => void remove(net)}
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
          ))}
        </DataTable>
      </PageBody>

      {showCreate && (
        <CreateNetworkDialog
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false)
            void refresh()
          }}
        />
      )}

      {inspecting && (
        <InspectSheet
          description="Saída do wslc network inspect."
          load={() => window.wslcApi.inspectNetwork(inspecting.name)}
          title={`Rede ${inspecting.name}`}
          onClose={() => setInspecting(null)}
        />
      )}

      {connecting && (
        <ConnectContainerDialog
          mode={connecting.mode}
          network={connecting.network}
          onClose={() => setConnecting(null)}
        />
      )}
    </PageShell>
  )
}
