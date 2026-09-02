import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { BuildImageOptions } from '@shared/schemas'
import { AppModal, Button, IconAction, SelectInput, SwitchInput, Tabs, TextInput } from '@/design'
import { useStreamStore } from '@/stores/stream-store'

interface Props {
  onClose: () => void
}

/** Vírgulas separam itens; vazios são descartados. */
const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * `--progress` da CLI. 'auto' é o padrão e não vai para a linha de comando;
 * 'plain' é o que mostra a saída de cada passo, útil quando o build falha.
 */
const PROGRESS = [
  { id: 'auto', label: 'Automático', description: 'O padrão da CLI' },
  { id: 'plain', label: 'Texto corrido', description: 'Mostra a saída de cada passo' },
  { id: 'tty', label: 'Interativo', description: 'Barras que se atualizam no lugar' },
  { id: 'quiet', label: 'Silencioso', description: 'Só o resultado final' }
] as const

/** Build de imagem a partir de um Containerfile/Dockerfile (`wslc image build`). */
export default function BuildImageDialog({ onClose }: Props): React.JSX.Element {
  const openStream = useStreamStore((s) => s.open)
  const [tag, setTag] = useState('')
  const [context, setContext] = useState('')
  const [file, setFile] = useState('')
  // Avançado
  const [buildArgs, setBuildArgs] = useState('')
  const [target, setTarget] = useState('')
  const [labels, setLabels] = useState('')
  const [secrets, setSecrets] = useState('')
  const [output, setOutput] = useState('')
  const [iidfile, setIidfile] = useState('')
  const [progress, setProgress] = useState<BuildImageOptions['progress']>('auto')
  const [noCache, setNoCache] = useState(false)
  const [pull, setPull] = useState(false)

  const pickFolder = async (): Promise<void> => {
    const dir = await window.wslcApi.pickDirectory()
    if (dir) setContext(dir)
  }

  const submit = async (): Promise<void> => {
    if (!tag.trim() || !context.trim()) return
    await openStream(`Build de ${tag.trim()}`, () =>
      window.wslcApi.buildImage({
        tag: tag.trim(),
        context: context.trim(),
        file: file.trim() || undefined,
        buildArgs: splitList(buildArgs),
        noCache: noCache || undefined,
        target: target.trim() || undefined,
        secrets: splitList(secrets),
        output: output.trim() || undefined,
        progress,
        iidfile: iidfile.trim() || undefined,
        labels: splitList(labels),
        pull: pull || undefined
      })
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
      size="lg"
      title="Build de imagem"
      onClose={onClose}
    >
      <Tabs className="min-w-0" defaultSelectedKey="general">
        <Tabs.List>
          <Tabs.Tab id="general">Geral</Tabs.Tab>
          <Tabs.Tab id="advanced">Avançado</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="general">
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
          <TextInput
            hint="Pares CHAVE=VALOR disponíveis nos ARG do Containerfile. Separe por vírgula."
            label="Argumentos de build"
            placeholder="ex.: VERSION=1.2.0, NODE_ENV=production"
            value={buildArgs}
            onChange={setBuildArgs}
          />
          <div className="field-group flex flex-col gap-3 px-4 py-3">
            <SwitchInput
              hint="Ignora as camadas em cache e reconstrói tudo (--no-cache)."
              isSelected={noCache}
              label="Ignorar o cache"
              onChange={setNoCache}
            />
            <SwitchInput
              hint="Busca a versão mais nova da imagem base antes de construir (--pull)."
              isSelected={pull}
              label="Atualizar a imagem base"
              onChange={setPull}
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="advanced">
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              hint="Para em um estágio do Containerfile multi-stage, em vez de construir até o fim."
              label="Estágio alvo"
              placeholder="ex.: builder"
              value={target}
              onChange={setTarget}
            />
            <SelectInput
              hint="Como a saída do build aparece no painel. “Texto corrido” é o que ajuda quando falha."
              label="Formato do progresso"
              options={PROGRESS}
              value={progress ?? 'auto'}
              onChange={(v) => setProgress(v as BuildImageOptions['progress'])}
            />
          </div>
          <TextInput
            hint="Pares chave=valor gravados como metadados da imagem. Separe por vírgula."
            label="Labels"
            placeholder="ex.: app=site, env=dev"
            value={labels}
            onChange={setLabels}
          />
          <TextInput
            hint="Segredos expostos ao build sem virar camada: id=NOME[,type=env|file][,env=VAR|,src=CAMINHO]. Separe por vírgula."
            label="Segredos"
            placeholder="ex.: id=npmrc,src=C:\\Users\\eu\\.npmrc"
            value={secrets}
            onChange={setSecrets}
          />
          <TextInput
            hint="Destino no formato do docker buildx, ex.: type=local,dest=C:\\saida ou type=tar,dest=out.tar. Vazio carrega a imagem na sessão."
            label="Saída do build"
            placeholder="ex.: type=local,dest=C:\\saida"
            value={output}
            onChange={setOutput}
          />
          <TextInput
            hint="Arquivo onde gravar o ID da imagem construída — útil para scripts que rodam depois."
            label="Arquivo do ID da imagem"
            placeholder="ex.: C:\\build\\imagem.txt"
            value={iidfile}
            onChange={setIidfile}
          />
        </Tabs.Panel>
      </Tabs>
    </AppModal>
  )
}
