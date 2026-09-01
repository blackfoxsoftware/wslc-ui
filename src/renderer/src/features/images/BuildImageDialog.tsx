import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { AppModal, Button, IconAction, TextInput } from '@/design'
import { useStreamStore } from '@/stores/stream-store'

interface Props {
  onClose: () => void
}

/** Build de imagem a partir de um Containerfile/Dockerfile (`wslc build`). */
export default function BuildImageDialog({ onClose }: Props): React.JSX.Element {
  const openStream = useStreamStore((s) => s.open)
  const [tag, setTag] = useState('')
  const [context, setContext] = useState('')
  const [file, setFile] = useState('')

  const pickFolder = async (): Promise<void> => {
    const dir = await window.wslcApi.pickDirectory()
    if (dir) setContext(dir)
  }

  const submit = async (): Promise<void> => {
    if (!tag.trim() || !context.trim()) return
    await openStream(`Build de ${tag.trim()}`, () =>
      window.wslcApi.buildImage({ tag: tag.trim(), context: context.trim(), file: file.trim() || undefined })
    )
    onClose()
  }

  return (
    <AppModal
      description="Constrói uma imagem a partir de um Containerfile/Dockerfile. O progresso aparece no painel de saída."
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={!tag.trim() || !context.trim()} onPress={() => void submit()}>
            Iniciar build
          </Button>
        </>
      }
      size="md"
      title="Build de imagem"
      onClose={onClose}
    >
      <TextInput
        autoFocus
        label="Tag da imagem"
        placeholder="ex.: meu-app:latest"
        value={tag}
        onChange={setTag}
      />
      <div className="flex items-end gap-2">
        <TextInput
          className="flex-1"
          label="Pasta de contexto"
          placeholder="pasta com o Containerfile"
          value={context}
          onChange={setContext}
        />
        <IconAction label="Escolher pasta" variant="secondary" onPress={() => void pickFolder()}>
          <FolderOpen className="size-4" />
        </IconAction>
      </div>
      <TextInput
        hint="Opcional: vazio usa o Containerfile padrão da pasta de contexto."
        label="Containerfile"
        placeholder="ex.: Dockerfile.prod"
        value={file}
        onChange={setFile}
      />
    </AppModal>
  )
}
