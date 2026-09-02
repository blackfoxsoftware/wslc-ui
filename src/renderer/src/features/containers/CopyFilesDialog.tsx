import { useState } from 'react'
import { ArrowLeftRight, FileUp, FolderOpen } from 'lucide-react'
import type { ContainerInfo, CopyDirection } from '@shared/schemas'
import { AppModal, Button, SelectInput, SwitchInput, TextInput } from '@/design'
import { useContainersStore } from './store'

interface Props {
  container: ContainerInfo
  onClose: () => void
}

const DIRECTIONS = [
  {
    id: 'to-container',
    label: 'Do Windows para o container',
    description: 'Enviar um arquivo ou pasta daqui para dentro'
  },
  {
    id: 'from-container',
    label: 'Do container para o Windows',
    description: 'Trazer um arquivo ou pasta de dentro para cá'
  }
] as const

/**
 * `wslc container cp` — comando que chegou na 2.9.8.
 *
 * A CLI recebe dois caminhos e descobre a direção pelo prefixo `CONTAINER:`.
 * Aqui a direção é uma escolha explícita: assim o rótulo de cada campo pode
 * dizer de que lado ele está, em vez de pedir uma string com prefixo.
 *
 * Os dois lados NÃO são simétricos, e isso é medido contra a CLI 2.9.9:
 * entrando, o destino precisa ser uma PASTA que já existe (um caminho de
 * arquivo dá "Could not find the file …" se não existir, ou "extraction point
 * is not a directory" se existir); saindo, o destino pode ser um arquivo novo,
 * que a CLI cria. É diferente do docker, que renomeia nos dois sentidos — daí
 * o rótulo dizer "pasta" de um lado só.
 *
 * Só existe no motor CLI: o SDK nativo não tem nenhuma API de cópia.
 */
export default function CopyFilesDialog({ container, onClose }: Props): React.JSX.Element {
  const copy = useContainersStore((s) => s.copy)
  const label = container.name || container.id.slice(0, 12)
  const [direction, setDirection] = useState<CopyDirection>('to-container')
  const [hostPath, setHostPath] = useState('')
  const [containerPath, setContainerPath] = useState('')
  const [archive, setArchive] = useState(false)
  const [busy, setBusy] = useState(false)

  const paraDentro = direction === 'to-container'
  const pronto = hostPath.trim() !== '' && containerPath.trim() !== ''

  const pickFile = async (): Promise<void> => {
    const path = await window.wslcApi.pickFile('Arquivo a copiar para o container', ['*'])
    if (path) setHostPath(path)
  }

  const pickFolder = async (): Promise<void> => {
    const dir = await window.wslcApi.pickDirectory()
    if (dir) setHostPath(dir)
  }

  const submit = async (): Promise<void> => {
    if (!pronto || busy) return
    setBusy(true)
    try {
      const ok = await copy(
        {
          container: container.id || container.name,
          direction,
          hostPath: hostPath.trim(),
          containerPath: containerPath.trim(),
          archive: archive || undefined
        },
        label
      )
      if (ok) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppModal
      description="Copia arquivos e pastas entre o Windows e o container, nos dois sentidos."
      footer={
        <>
          <Button isDisabled={busy} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={busy || !pronto} onPress={() => void submit()}>
            {busy ? 'Copiando…' : 'Copiar'}
          </Button>
        </>
      }
      size="md"
      title={`Copiar arquivos · ${label}`}
      onClose={onClose}
    >
      <SelectInput
        label="Sentido da cópia"
        options={DIRECTIONS}
        value={direction}
        onChange={(v) => setDirection(v as CopyDirection)}
      />

      <TextInput
        autoFocus
        // Escolher arquivo só faz sentido na direção que ENVIA: saindo do
        // container, o destino é uma pasta (ou um arquivo que ainda não existe).
        action={[
          ...(paraDentro
            ? [
                {
                  label: 'Escolher arquivo',
                  icon: <FileUp className="size-4" />,
                  onPress: () => void pickFile()
                }
              ]
            : []),
          {
            label: 'Escolher pasta',
            icon: <FolderOpen className="size-4" />,
            onPress: () => void pickFolder()
          }
        ]}
        hint={
          paraDentro
            ? 'Arquivo ou pasta do Windows que será enviado.'
            : 'Onde salvar: uma pasta existente ou o caminho de um arquivo novo, que a CLI cria.'
        }
        label={paraDentro ? 'Origem no Windows' : 'Destino no Windows'}
        placeholder="ex.: C:\projeto\config.yaml"
        value={hostPath}
        onChange={setHostPath}
      />

      <div className="field-row flex items-center justify-center px-4 py-2 text-muted">
        <ArrowLeftRight className="size-4" />
      </div>

      <TextInput
        hint={
          paraDentro
            ? 'Pasta que já existe dentro do container: a wslc copia para dentro dela, sem renomear o arquivo.'
            : 'Caminho absoluto do arquivo ou da pasta a copiar.'
        }
        label={paraDentro ? 'Pasta de destino no container' : 'Origem no container'}
        placeholder={paraDentro ? 'ex.: /etc/nginx/conf.d/' : 'ex.: /etc/nginx/nginx.conf'}
        value={containerPath}
        onChange={setContainerPath}
        onSubmitKey={() => void submit()}
      />

      <div className="field-row px-4 py-2.5">
        <SwitchInput
          hint="Preserva dono e permissões dos arquivos copiados (-a)."
          isSelected={archive}
          label="Modo arquivo"
          onChange={setArchive}
        />
      </div>
    </AppModal>
  )
}
