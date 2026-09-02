import { useEffect, useState } from 'react'
import type { ContainerInfo } from '@shared/schemas'
import { AppModal, Button, SelectInput, TagsInput, TextInput } from '@/design'
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
  // Opções que a 2.9.8 acrescentou ao `network connect` (PR #41070).
  const [aliases, setAliases] = useState<string[]>([])
  const [ip, setIp] = useState('')
  const [links, setLinks] = useState<string[]>([])
  const [linkLocalIps, setLinkLocalIps] = useState<string[]>([])
  const [driverOpts, setDriverOpts] = useState<string[]>([])
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
      const ok = await (mode === 'connect'
        ? connect({
            network,
            container: selected,
            aliases: aliases,
            ip: ip.trim() || undefined,
            links: links,
            linkLocalIps: linkLocalIps,
            driverOpts: driverOpts
          })
        : disconnect(network, selected))
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

      {/* Desconectar não tem opção nenhuma: é só rede + container. */}
      {mode === 'connect' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TagsInput
              hint="Outros nomes pelos quais o container responde nesta rede."
              label="Aliases na rede"
              placeholder="ex.: api, backend"
              values={aliases}
              onChange={setAliases}
            />
            <TextInput
              hint="IPv4 fixo dentro da rede. Precisa estar na sub-rede dela."
              label="Endereço IP"
              placeholder="ex.: 172.20.0.10"
              value={ip}
              onChange={setIp}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TagsInput
              hint="Ligações a outros containers no formato nome:alias."
              label="Links"
              placeholder="ex.: db:postgres"
              values={links}
              onChange={setLinks}
            />
            <TagsInput
              hint="Endereços IPv4 link-local adicionais."
              label="IPs link-local"
              placeholder="ex.: 169.254.10.1"
              values={linkLocalIps}
              onChange={setLinkLocalIps}
            />
          </div>
          <TagsInput
            hint="Opções do driver de endpoint, em pares chave=valor."
            label="Opções do driver"
            placeholder="ex.: com.docker.network.endpoint.exposedports=80"
            values={driverOpts}
            onChange={setDriverOpts}
          />
        </>
      )}
    </AppModal>
  )
}
