import { useState } from 'react'
import { AppModal, Button, NumberInput, SelectInput, TagsInput, TextInput } from '@/design'
import { useVolumesStore } from './store'

interface Props {
  /** No motor nativo TODO volume é um VHDX; na CLI o VHDX é opcional. */
  nativeEngine: boolean
  onClose: () => void
  onDone: () => void
}

const VHD_TYPES = [
  { id: 'dynamic', label: 'Dinâmico', description: 'Cresce conforme o uso' },
  { id: 'fixed', label: 'Fixo', description: 'Pré-alocado no disco' }
]

/**
 * Na CLI o padrão é o driver `guest` (uma pasta na sessão). A partir da wslc
 * 2.9.9 ela também cria VHDX — `volume create -d vhd -o SizeBytes=…` —, com as
 * mesmas opções do SDK nativo, então o disco virtual deixou de ser exclusivo
 * do motor nativo e vira uma escolha aqui.
 */
const CLI_DRIVERS = [
  { id: 'guest', label: 'guest (padrão)', description: 'Pasta na sessão, cresce sem limite' },
  { id: 'vhd', label: 'vhd', description: 'Disco virtual .vhdx com tamanho fixo' }
]

export default function CreateVolumeDialog({ nativeEngine, onClose, onDone }: Props): React.JSX.Element {
  const create = useVolumesStore((s) => s.create)
  const [name, setName] = useState('')
  const [driver, setDriver] = useState<'guest' | 'vhd'>('guest')
  const [sizeMb, setSizeMb] = useState<number | undefined>(1024)
  const [type, setType] = useState<'dynamic' | 'fixed'>('dynamic')
  const [uid, setUid] = useState<number | undefined>()
  const [gid, setGid] = useState<number | undefined>()
  const [labels, setLabels] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  // No motor nativo não há escolha: a sessão só cria VHDX.
  const vhdVolume = nativeEngine || driver === 'vhd'

  // O NumberInput já recusa o que não é número inteiro no intervalo: aqui só
  // resta perguntar se o campo foi preenchido.
  const sizeOk = !vhdVolume || sizeMb !== undefined
  // uid e gid andam juntos: ou os dois, ou nenhum (root:root).
  const ownerGiven = uid !== undefined || gid !== undefined
  const ownerFull = uid !== undefined && gid !== undefined
  const ownerOk = !vhdVolume || !ownerGiven || ownerFull

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || !sizeOk || !ownerOk || (vhdVolume && sizeMb === undefined)) return
    setCreating(true)
    try {
      const vhd = vhdVolume
        ? {
            sizeMb: sizeMb as number,
            fixed: type === 'fixed',
            owner: ownerFull ? { uid: uid as number, gid: gid as number } : undefined
          }
        : undefined
      // Labels são da CLI (-l): o SDK cria o .vhdx e não guarda metadados.
      const lista = nativeEngine ? undefined : labels
      if (await create(trimmed, vhd, lista)) onDone()
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppModal
      description={
        nativeEngine
          ? 'Cria um volume VHDX na sessão nativa: tamanho, tipo e dono são opcionais.'
          : 'Volumes nomeados persistem dados entre execuções de containers.'
      }
      footer={
        <>
          <Button isDisabled={creating} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={creating || !name.trim() || !sizeOk || !ownerOk} onPress={() => void submit()}>
            {creating ? 'Criando…' : 'Criar volume'}
          </Button>
        </>
      }
      size="md"
      title="Criar volume"
      onClose={onClose}
    >
      <TextInput
        autoFocus
        label="Nome do volume"
        placeholder="ex.: dados-do-app"
        value={name}
        onChange={setName}
        onSubmitKey={() => void submit()}
      />

      {!nativeEngine && (
        <SelectInput
          hint="O driver vhd exige a CLI wslc 2.9.9 ou mais nova."
          label="Driver"
          options={CLI_DRIVERS}
          value={driver}
          onChange={(v) => setDriver(v as typeof driver)}
        />
      )}

      {!nativeEngine && (
        <TagsInput
          hint="Pares chave=valor. Aparecem no inspect do volume."
          label="Labels"
          placeholder="ex.: app=site, env=dev"
          values={labels}
          onChange={setLabels}
        />
      )}

      {vhdVolume && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              hint="Tamanho do disco virtual, em MB."
              label="Tamanho"
              value={sizeMb}
              onChange={setSizeMb}
            />
            <SelectInput
              label="Tipo do VHDX"
              options={VHD_TYPES}
              value={type}
              onChange={(v) => setType(v as typeof type)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              minValue={0}
              hint="Opcional. uid e gid andam juntos; vazio deixa o volume como root."
              label="uid do dono"
              placeholder="root"
              value={uid}
              onChange={setUid}
            />
            <NumberInput
              minValue={0}
              hint="Opcional. uid e gid andam juntos; vazio deixa o volume como root."
              label="gid do dono"
              placeholder="root"
              value={gid}
              onChange={setGid}
            />
          </div>
        </>
      )}
    </AppModal>
  )
}
