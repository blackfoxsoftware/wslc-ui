import { useState } from 'react'
import { AppModal, Button, SelectInput, TextInput } from '@/design'
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
  const [sizeMb, setSizeMb] = useState('1024')
  const [type, setType] = useState<'dynamic' | 'fixed'>('dynamic')
  const [uid, setUid] = useState('')
  const [gid, setGid] = useState('')
  const [labels, setLabels] = useState('')
  const [creating, setCreating] = useState(false)

  // No motor nativo não há escolha: a sessão só cria VHDX.
  const vhdVolume = nativeEngine || driver === 'vhd'

  const parsedSize = Number.parseInt(sizeMb, 10)
  const sizeOk = !vhdVolume || (Number.isFinite(parsedSize) && parsedSize > 0)
  // uid e gid andam juntos: ou os dois, ou nenhum (root:root).
  const ownerGiven = uid.trim() !== '' || gid.trim() !== ''
  const parsedUid = Number.parseInt(uid, 10)
  const parsedGid = Number.parseInt(gid, 10)
  const ownerOk =
    !vhdVolume ||
    !ownerGiven ||
    (Number.isInteger(parsedUid) && parsedUid >= 0 && Number.isInteger(parsedGid) && parsedGid >= 0)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || !sizeOk || !ownerOk) return
    setCreating(true)
    try {
      const vhd = vhdVolume
        ? {
            sizeMb: parsedSize,
            fixed: type === 'fixed',
            owner: ownerGiven ? { uid: parsedUid, gid: parsedGid } : undefined
          }
        : undefined
      // Labels são da CLI (-l): o SDK cria o .vhdx e não guarda metadados.
      const lista = nativeEngine
        ? undefined
        : labels
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean)
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
        <TextInput
          hint="Pares chave=valor separados por vírgula. Aparecem no inspect do volume."
          label="Labels"
          placeholder="ex.: app=site, env=dev"
          value={labels}
          onChange={setLabels}
        />
      )}

      {vhdVolume && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
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
            <TextInput
              hint="Opcional. uid e gid andam juntos; vazio deixa o volume como root."
              label="uid do dono"
              placeholder="root"
              value={uid}
              onChange={setUid}
            />
            <TextInput
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
