import { useState } from 'react'
import { AppModal, Button, SwitchInput, TagsInput, TextInput } from '@/design'
import { useNetworksStore } from './store'

interface Props {
  onClose: () => void
  onDone: () => void
}

export default function CreateNetworkDialog({ onClose, onDone }: Props): React.JSX.Element {
  const create = useNetworksStore((s) => s.create)
  const [name, setName] = useState('')
  const [subnet, setSubnet] = useState('')
  const [gateway, setGateway] = useState('')
  const [ipRange, setIpRange] = useState('')
  const [internal, setInternal] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const ok = await create({
        name: trimmed,
        subnet: subnet.trim() || undefined,
        gateway: gateway.trim() || undefined,
        ipRange: ipRange.trim() || undefined,
        internal: internal || undefined,
        labels: labels
      })
      if (ok) onDone()
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppModal
      description="Rede bridge para containers do motor CLI. Conecte containers pela lista ou pela opção “Rede” do diálogo de executar."
      footer={
        <>
          <Button isDisabled={creating} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={creating || !name.trim()} onPress={() => void submit()}>
            {creating ? 'Criando…' : 'Criar rede'}
          </Button>
        </>
      }
      size="md"
      title="Criar rede"
      onClose={onClose}
    >
      <TextInput
        autoFocus
        label="Nome da rede"
        placeholder="ex.: backend"
        value={name}
        onChange={setName}
        onSubmitKey={() => void submit()}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          hint="Opcional: faixa de IPs da rede, em CIDR. Vazio deixa o wslc escolher."
          label="Sub-rede"
          placeholder="ex.: 172.20.0.0/16"
          value={subnet}
          onChange={setSubnet}
        />
        <TextInput
          hint="Opcional: IP do gateway dentro da sub-rede."
          label="Gateway"
          placeholder="ex.: 172.20.0.1"
          value={gateway}
          onChange={setGateway}
        />
      </div>
      <TextInput
        hint="Opcional: sub-faixa da sub-rede de onde saem os IPs automáticos, deixando o resto livre para IPs fixos (--ip-range, CLI 2.9.8+)."
        label="Faixa de IPs automáticos"
        placeholder="ex.: 172.20.10.0/24"
        value={ipRange}
        onChange={setIpRange}
      />
      <TagsInput
        hint="Pares chave=valor."
        label="Labels"
        placeholder="ex.: app=site, env=dev"
        values={labels}
        onChange={setLabels}
      />
      <div className="field-row px-4 py-3">
        <SwitchInput
          hint="Sem acesso externo: os containers só falam entre si (--internal)."
          isSelected={internal}
          label="Rede interna"
          onChange={setInternal}
        />
      </div>
    </AppModal>
  )
}
