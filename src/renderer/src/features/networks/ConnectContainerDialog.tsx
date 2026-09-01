import { useEffect, useState } from 'react'
import type { ContainerInfo } from '@shared/schemas'
import { AppModal, Button, SelectInput } from '@/design'
import { useNetworksStore } from './store'

interface Props {
  network: string
  mode: 'connect' | 'disconnect'
  onClose: () => void
}

const COPY = {
  connect: {
    title: 'Conectar container',
    description: 'O container passa a alcançar os outros containers desta rede pelo nome.',
    action: 'Conectar',
    busy: 'Conectando…'
  },
  disconnect: {
    title: 'Desconectar container',
    description: 'O container sai da rede. A CLI não lista os conectados, então escolha na lista.',
    action: 'Desconectar',
    busy: 'Desconectando…'
  }
} as const

export default function ConnectContainerDialog({ network, mode, onClose }: Props): React.JSX.Element {
  const connect = useNetworksStore((s) => s.connect)
  const disconnect = useNetworksStore((s) => s.disconnect)
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const copy = COPY[mode]

  useEffect(() => {
    let cancelled = false
    window.wslcApi
      .listContainers(true)
      .then((list) => !cancelled && setContainers(list))
      .catch(() => setContainers([]))
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    try {
      const ok = await (mode === 'connect' ? connect(network, selected) : disconnect(network, selected))
      if (ok) onClose()
    } finally {
      setBusy(false)
    }
  }

  const options = containers.map((c) => ({
    id: c.id || c.name,
    label: c.name || c.id.slice(0, 12),
    description: `${c.image} · ${c.status}`
  }))

  return (
    <AppModal
      description={copy.description}
      footer={
        <>
          <Button isDisabled={busy} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={busy || !selected} onPress={() => void submit()}>
            {busy ? copy.busy : copy.action}
          </Button>
        </>
      }
      size="md"
      title={`${copy.title} na rede “${network}”`}
      onClose={onClose}
    >
      <SelectInput
        label="Container"
        options={options}
        placeholder={containers.length === 0 ? 'Nenhum container encontrado' : 'Selecione um container'}
        value={selected}
        onChange={setSelected}
      />
    </AppModal>
  )
}
