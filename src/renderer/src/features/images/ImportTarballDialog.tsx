import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { AppModal, Button, Label, Mono, TextInput } from '@/design'
import { useStreamStore } from '@/stores/stream-store'

interface Props {
  onClose: () => void
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/**
 * Importa um tarball de sistema de arquivos como uma imagem nova
 * (`image import` / WslcImportSessionImageFromFile, conforme o motor).
 */
export default function ImportTarballDialog({ onClose }: Props): React.JSX.Element {
  const openStream = useStreamStore((s) => s.open)
  const [path, setPath] = useState<string | null>(null)
  const [ref, setRef] = useState('')

  const pick = async (): Promise<void> => {
    const chosen = await window.wslcApi.pickFile('Escolher o tarball de sistema de arquivos', [
      'tar',
      'tar.gz',
      'tgz'
    ])
    if (chosen) setPath(chosen)
  }

  const canSubmit = path !== null && ref.trim().length > 0

  const submit = (): void => {
    if (!path || !canSubmit) return
    const target = ref.trim()
    void openStream(`Import de ${target}`, () => window.wslcApi.importImageTarball(path, target))
    onClose()
  }

  return (
    <AppModal
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={!canSubmit} onPress={submit}>
            Importar
          </Button>
        </>
      }
      size="md"
      title="Importar tarball"
      onClose={onClose}
    >
      <p className="text-sm text-muted">
        Cria uma imagem a partir de um tarball de sistema de arquivos, como o{' '}
        <Mono className="text-foreground">image import</Mono>. Para tarballs salvos por{' '}
        <Mono className="text-foreground">image save</Mono>, use &quot;Carregar imagem salva&quot;.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label>Arquivo</Label>
        <div className="flex items-center gap-2">
          <span className="field-row min-w-0 flex-1 truncate px-3 py-2 text-sm text-muted">
            {path ? fileName(path) : 'Nenhum arquivo escolhido'}
          </span>
          <Button size="sm" variant="secondary" onPress={() => void pick()}>
            <FolderOpen className="size-4" />
            Escolher…
          </Button>
        </div>
      </div>

      <TextInput
        label="Nome da imagem"
        placeholder="ex.: minha-base:v1"
        value={ref}
        onChange={setRef}
        onSubmitKey={submit}
      />
    </AppModal>
  )
}
