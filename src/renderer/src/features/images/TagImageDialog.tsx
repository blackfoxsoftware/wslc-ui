import { useState } from 'react'
import { AppModal, Button, Mono, TextInput } from '@/design'
import { useImagesStore } from './store'

interface Props {
  source: string
  onClose: () => void
}

/** Cria uma nova tag para uma imagem existente (`wslc tag`). */
export default function TagImageDialog({ source, onClose }: Props): React.JSX.Element {
  const tagImage = useImagesStore((s) => s.tag)
  const [target, setTarget] = useState('')
  const [working, setWorking] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = target.trim()
    if (!trimmed) return
    setWorking(true)
    try {
      if (await tagImage(source, trimmed)) onClose()
    } finally {
      setWorking(false)
    }
  }

  return (
    <AppModal
      footer={
        <>
          <Button isDisabled={working} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={working || !target.trim()} onPress={() => void submit()}>
            {working ? 'Criando…' : 'Criar tag'}
          </Button>
        </>
      }
      size="md"
      title="Nova tag"
      onClose={onClose}
    >
      <p className="text-sm text-muted">
        Cria uma tag adicional para <Mono className="text-foreground">{source}</Mono>, útil antes de um push
        para um registry.
      </p>
      <TextInput
        autoFocus
        label="Nova referência"
        placeholder="ex.: meuregistry.io/app:v1"
        value={target}
        onChange={setTarget}
        onSubmitKey={() => void submit()}
      />
    </AppModal>
  )
}
