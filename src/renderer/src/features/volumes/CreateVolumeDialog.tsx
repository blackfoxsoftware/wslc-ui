import { useState } from 'react'
import { AppModal, Button, SelectInput, TextInput } from '@/design'
import { useVolumesStore } from './store'

interface Props {
  /** No motor nativo o volume é um VHDX com tamanho, tipo e dono. */
  nativeEngine: boolean
  onClose: () => void
  onDone: () => void
}

const VHD_TYPES = [
  { id: 'dynamic', label: 'Dinâmico', description: 'Cresce conforme o uso' },
  { id: 'fixed', label: 'Fixo', description: 'Pré-alocado no disco' }
]

export default function CreateVolumeDialog({ nativeEngine, onClose, onDone }: Props): React.JSX.Element {
  const create = useVolumesStore((s) => s.create)
  const [name, setName] = useState('')
  const [sizeMb, setSizeMb] = useState('1024')
  const [type, setType] = useState<'dynamic' | 'fixed'>('dynamic')
  const [uid, setUid] = useState('')
  const [gid, setGid] = useState('')
  const [creating, setCreating] = useState(false)

  const parsedSize = Number.parseInt(sizeMb, 10)
  const sizeOk = !nativeEngine || (Number.isFinite(parsedSize) && parsedSize > 0)
  // uid e gid andam juntos: ou os dois, ou nenhum (root:root).
  const ownerGiven = uid.trim() !== '' || gid.trim() !== ''
  const parsedUid = Number.parseInt(uid, 10)
  const parsedGid = Number.parseInt(gid, 10)
  const ownerOk =
    !nativeEngine ||
    !ownerGiven ||
    (Number.isInteger(parsedUid) && parsedUid >= 0 && Number.isInteger(parsedGid) && parsedGid >= 0)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || !sizeOk || !ownerOk) return
    setCreating(true)
    try {
      const vhd = nativeEngine
        ? {
            sizeMb: parsedSize,
            fixed: type === 'fixed',
            owner: ownerGiven ? { uid: parsedUid, gid: parsedGid } : undefined
          }
        : undefined
      if (await create(trimmed, vhd)) onDone()
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

      {nativeEngine && (
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
