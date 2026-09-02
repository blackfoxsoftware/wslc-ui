import { useEffect, useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import type { NetworkInfo, RunContainerOptions } from '@shared/schemas'
import {
  BareInput,
  AppModal,
  Button,
  ErrorAlert,
  Header,
  Hint,
  IconAction,
  Label,
  ListBox,
  Notice,
  Select,
  SelectInput,
  Separator,
  SwitchInput,
  Tabs,
  TextAreaInput,
  TextInput,
  toast
} from '@/design'
import { catalogEntry, CATEGORIES, CATEGORY_LABELS, IMAGE_CATALOG } from '@/features/images/catalog'
import { useEngineStore } from '@/stores/engine-store'

interface Props {
  onClose: () => void
  onDone: () => void
}

const CUSTOM = '__custom__'

interface PairRow {
  left: string
  right: string
}

const toPair = (raw: string): PairRow => {
  const sep = raw.includes('=') ? '=' : ':'
  const idx = raw.indexOf(sep)
  return idx < 0 ? { left: raw, right: '' } : { left: raw.slice(0, idx), right: raw.slice(idx + 1) }
}

/** "nginx:latest" / "docker.io/library/nginx" → "nginx" (sugestão de nome). */
const suggestName = (ref: string): string => {
  const repo = ref.split(':')[0]
  const last = repo.split('/').pop() ?? repo
  return last.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

const joinPairs = (rows: PairRow[], sep: string): string[] =>
  rows.filter((r) => r.left.trim() && r.right.trim()).map((r) => `${r.left.trim()}${sep}${r.right.trim()}`)

/** "a, b , c" → ["a","b","c"] (vazios descartados). */
const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const NO_NETWORK = '__none__'

/**
 * `--pull` da CLI: quando consultar o registry. 'missing' é o padrão e não
 * vai para a linha de comando.
 */
const PULL_POLICIES = [
  { id: 'missing', label: 'Se faltar (padrão)', description: 'Só baixa quando a imagem não está local' },
  { id: 'always', label: 'Sempre', description: 'Consulta o registry a cada execução' },
  { id: 'never', label: 'Nunca', description: 'Falha se a imagem não estiver local' }
] as const

interface PairListProps {
  rows: PairRow[]
  onChange: (rows: PairRow[]) => void
  leftLabel: string
  rightLabel: string
  leftPlaceholder: string
  rightPlaceholder: string
  separator: string
  addLabel: string
}

function PairList({
  rows,
  onChange,
  leftLabel,
  rightLabel,
  leftPlaceholder,
  rightPlaceholder,
  separator,
  addLabel
}: PairListProps): React.JSX.Element {
  const update = (index: number, patch: Partial<PairRow>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- linhas posicionais e editáveis: o índice é a identidade
        <div key={i} className="flex items-center gap-2">
          <BareInput
            ariaLabel={`${leftLabel} ${i + 1}`}
            placeholder={leftPlaceholder}
            value={row.left}
            onChange={(v) => update(i, { left: v })}
          />
          <span aria-hidden className="shrink-0 text-muted">
            {separator}
          </span>
          <BareInput
            ariaLabel={`${rightLabel} ${i + 1}`}
            placeholder={rightPlaceholder}
            value={row.right}
            onChange={(v) => update(i, { right: v })}
          />
          <IconAction label="Remover linha" onPress={() => onChange(rows.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </IconAction>
        </div>
      ))}
      <Button
        className="w-fit"
        size="sm"
        variant="secondary"
        onPress={() => onChange([...rows, { left: '', right: '' }])}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}

/** Linha de switch com explicação em tooltip — destacada do resto do form. */
function SwitchRow({
  label,
  hint,
  isSelected,
  onChange
}: {
  label: string
  hint: string
  isSelected: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="field-row px-4 py-2.5">
      <SwitchInput hint={hint} isSelected={isSelected} label={label} onChange={onChange} />
    </div>
  )
}

export default function RunDialog({ onClose, onDone }: Props): React.JSX.Element {
  const engineStatus = useEngineStore((s) => s.status)
  const nativeEngine = engineStatus?.engine === 'native'
  const [localImages, setLocalImages] = useState<string[]>([])
  const [loadingImages, setLoadingImages] = useState(true)
  const [imageChoice, setImageChoice] = useState<string>(CUSTOM)
  const [customImage, setCustomImage] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [ports, setPorts] = useState<PairRow[]>([])
  const [envRows, setEnvRows] = useState<PairRow[]>([])
  const [volumeRows, setVolumeRows] = useState<PairRow[]>([])
  const [newVolume, setNewVolume] = useState<PairRow>({ left: '', right: '' })
  const [command, setCommand] = useState('')
  const [detach, setDetach] = useState(true)
  const [rm, setRm] = useState(false)
  const [gpus, setGpus] = useState(false)
  // Rede & Ambiente (rede/aliases/dns/env-file/-P são só do motor CLI)
  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [network, setNetwork] = useState(NO_NETWORK)
  const [networkAliases, setNetworkAliases] = useState('')
  const [ip, setIp] = useState('')
  const [hostname, setHostname] = useState('')
  const [domainname, setDomainname] = useState('')
  const [dns, setDns] = useState('')
  const [dnsSearch, setDnsSearch] = useState('')
  const [envFile, setEnvFile] = useState('')
  const [publishAll, setPublishAll] = useState(false)
  // Volumes extras
  const [tmpfs, setTmpfs] = useState('')
  // Uma especificação --mount por linha: elas têm vírgula dentro
  // (type=bind,source=…,target=…), então vírgula não serve de separador.
  const [mounts, setMounts] = useState('')
  // Avançado
  const [entrypoint, setEntrypoint] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [pull, setPull] = useState<RunContainerOptions['pull']>('missing')
  const [createOnly, setCreateOnly] = useState(false)
  const [user, setUser] = useState('')
  const [labels, setLabels] = useState('')
  const [stopSignal, setStopSignal] = useState('')
  const [stopTimeout, setStopTimeout] = useState('')
  // Recursos & Saúde (tudo só CLI)
  const [cpus, setCpus] = useState('')
  const [memory, setMemory] = useState('')
  const [shmSize, setShmSize] = useState('')
  const [ulimits, setUlimits] = useState('')
  const [healthCmd, setHealthCmd] = useState('')
  const [healthInterval, setHealthInterval] = useState('')
  const [healthTimeout, setHealthTimeout] = useState('')
  const [healthRetries, setHealthRetries] = useState('')
  const [healthStartPeriod, setHealthStartPeriod] = useState('')
  const [healthDisable, setHealthDisable] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (nativeEngine) return
    let cancelled = false
    window.wslcApi
      .listNetworks()
      .then((nets) => !cancelled && setNetworks(nets))
      .catch(() => setNetworks([]))
    return () => {
      cancelled = true
    }
  }, [nativeEngine])

  /** Troca a imagem e aplica as facilidades: nome, portas, env e GPU sugeridos. */
  const selectImage = (ref: string): void => {
    setImageChoice(ref)
    if (ref === CUSTOM) return
    if (!nameTouched) setName(suggestName(ref))
    const entry = catalogEntry(ref)
    if (entry?.ports?.length) setPorts(entry.ports.map(toPair))
    if (entry?.env?.length) setEnvRows(entry.env.map(toPair))
    if (entry?.gpus) setGpus(true)
  }

  useEffect(() => {
    let cancelled = false
    window.wslcApi
      .listImages()
      .then((imgs) => {
        if (cancelled) return
        const refs = imgs
          .filter((i) => i.repository)
          .map((i) => (i.tag ? `${i.repository}:${i.tag}` : i.repository))
        setLocalImages(refs)
        if (refs.length > 0) selectImage(refs[0])
      })
      .catch(() => setLocalImages([]))
      .finally(() => !cancelled && setLoadingImages(false))
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- roda uma vez na montagem
  }, [])

  const image = imageChoice === CUSTOM ? customImage : imageChoice
  const catalogOnly = IMAGE_CATALOG.filter((item) => !localImages.includes(item.ref))
  const catalogGroups = CATEGORIES.map((category) => ({
    category,
    items: catalogOnly.filter((item) => item.category === category)
  })).filter((group) => group.items.length > 0)
  const willPull = imageChoice !== CUSTOM && !localImages.includes(imageChoice)

  const submit = async (): Promise<void> => {
    if (!image.trim()) return
    setRunning(true)
    setError(null)
    try {
      const volumes = joinPairs(volumeRows, ':')
      if (newVolume.left.trim() && newVolume.right.trim()) {
        // Cria o volume nomeado antes de anexar; se já existir, apenas anexa.
        await window.wslcApi.createVolume(newVolume.left.trim())
        volumes.push(`${newVolume.left.trim()}:${newVolume.right.trim()}`)
      }
      const parsedStopTimeout = Number.parseInt(stopTimeout, 10)
      const parsedRetries = Number.parseInt(healthRetries, 10)
      const health: RunContainerOptions['health'] = healthDisable
        ? { disable: true }
        : healthCmd.trim()
          ? {
              cmd: healthCmd.trim(),
              interval: healthInterval.trim() || undefined,
              timeout: healthTimeout.trim() || undefined,
              retries: Number.isInteger(parsedRetries) && parsedRetries > 0 ? parsedRetries : undefined,
              startPeriod: healthStartPeriod.trim() || undefined
            }
          : undefined
      // Campos exclusivos da CLI são omitidos no motor nativo (a UI já os desabilita).
      const cliOnly = nativeEngine
        ? {}
        : {
            network: network !== NO_NETWORK ? network : undefined,
            networkAliases: splitList(networkAliases),
            ip: ip.trim() || undefined,
            mounts: mounts
              .split('\n')
              .map((m) => m.trim())
              .filter(Boolean),
            pull,
            createOnly: createOnly || undefined,
            publishAll: publishAll || undefined,
            user: user.trim() || undefined,
            cpus: cpus.trim() || undefined,
            memory: memory.trim() || undefined,
            envFile: envFile.trim() || undefined,
            labels: splitList(labels),
            dns: splitList(dns),
            dnsSearch: splitList(dnsSearch),
            shmSize: shmSize.trim() || undefined,
            tmpfs: splitList(tmpfs),
            ulimits: splitList(ulimits),
            stopSignal: stopSignal.trim() || undefined,
            stopTimeout: Number.isInteger(parsedStopTimeout) ? parsedStopTimeout : undefined,
            health
          }
      const res = await window.wslcApi.runContainer({
        image,
        name: name.trim() || undefined,
        ports: joinPairs(ports, ':'),
        env: joinPairs(envRows, '='),
        volumes,
        command: command.trim() || undefined,
        detach,
        rm,
        gpus,
        hostname: hostname.trim() || undefined,
        domainname: domainname.trim() || undefined,
        workdir: workdir.trim() || undefined,
        entrypoint: entrypoint.trim() || undefined,
        ...cliOnly
      })
      if (res.ok) {
        const nome = name.trim() ? `"${name.trim()}" ` : ''
        toast.success(
          createOnly
            ? `Container ${nome}criado a partir de ${image} — inicie quando quiser.`
            : `Container ${nome}iniciado a partir de ${image}.`
        )
        onDone()
      } else {
        setError(res.stderr || res.stdout || 'Falha ao executar o container')
      }
    } finally {
      setRunning(false)
    }
  }

  const pickEnvFile = async (): Promise<void> => {
    const path = await window.wslcApi.pickFile('Arquivo de variáveis (KEY=valor por linha)', ['env', '*'])
    if (path) setEnvFile(path)
  }

  return (
    <AppModal
      description="Escolha uma imagem local ou do catálogo: portas e variáveis conhecidas já vêm preenchidas."
      footer={
        <>
          <Button isDisabled={running} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={running || !image.trim()} onPress={() => void submit()}>
            {running
              ? createOnly
                ? 'Criando…'
                : 'Executando…'
              : createOnly
                ? 'Criar sem iniciar'
                : willPull
                  ? 'Baixar e executar'
                  : 'Executar'}
          </Button>
        </>
      }
      isDismissable={!running}
      size="xl"
      title="Executar container"
      onClose={onClose}
    >
      {error && <ErrorAlert>{error}</ErrorAlert>}

      <Tabs className="min-w-0" defaultSelectedKey="general">
        <Tabs.List>
          <Tabs.Tab id="general">Geral</Tabs.Tab>
          <Tabs.Tab id="network">Rede &amp; Ambiente</Tabs.Tab>
          <Tabs.Tab id="volumes">Volumes</Tabs.Tab>
          <Tabs.Tab id="resources">Recursos</Tabs.Tab>
          <Tabs.Tab id="advanced">Avançado</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="general">
          <Select
            className="flex flex-col gap-1.5"
            isDisabled={loadingImages}
            placeholder={loadingImages ? 'Carregando imagens…' : 'Selecione uma imagem'}
            selectedKey={imageChoice}
            onSelectionChange={(key) => selectImage(String(key))}
          >
            <Label>Imagem</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {localImages.length > 0 && (
                  <ListBox.Section>
                    <Header>Imagens locais</Header>
                    {localImages.map((ref) => (
                      <ListBox.Item key={ref} id={ref} textValue={ref}>
                        {ref}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                )}
                {catalogGroups.map((group) => (
                  <ListBox.Section key={group.category}>
                    <Header>Catálogo · {CATEGORY_LABELS[group.category]}</Header>
                    {group.items.map((item) => (
                      <ListBox.Item key={item.ref} id={item.ref} textValue={`${item.name} · ${item.ref}`}>
                        {item.name} · {item.ref}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                ))}
                <Separator />
                <ListBox.Item id={CUSTOM} textValue="Digitar outra imagem…">
                  Digitar outra imagem…
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          {willPull && (
            <p className="-mt-2 text-xs text-muted">
              Essa imagem ainda não está baixada: o download acontece automaticamente ao executar.
            </p>
          )}

          {imageChoice === CUSTOM && (
            <TextInput
              label="Referência da imagem"
              placeholder="ex.: nginx:latest"
              value={customImage}
              onChange={setCustomImage}
            />
          )}

          <TextInput
            label="Nome do container"
            placeholder="ex.: web"
            value={name}
            onChange={(v) => {
              setName(v)
              setNameTouched(true)
            }}
          />

          {!nativeEngine && (
            <SelectInput
              hint="Quando consultar o registry antes de subir (--pull)."
              label="Buscar a imagem"
              options={PULL_POLICIES}
              value={pull ?? 'missing'}
              onChange={(v) => setPull(v as RunContainerOptions['pull'])}
            />
          )}

          <SwitchRow
            hint="Mantém o container rodando após iniciar (-d). Sem efeito quando o container nasce parado."
            isSelected={detach && !createOnly}
            label="Executar em segundo plano"
            onChange={setDetach}
          />
          {!nativeEngine && (
            <SwitchRow
              hint="Usa `container create`: prepara o container com toda esta configuração e deixa parado, para iniciar depois."
              isSelected={createOnly}
              label="Criar sem iniciar"
              onChange={setCreateOnly}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="network">
          <div className="flex flex-col gap-2">
            <Label>Portas</Label>
            <PairList
              addLabel="Adicionar porta"
              leftLabel="Porta do host"
              leftPlaceholder="ex.: 8080"
              rightLabel="Porta do container"
              rightPlaceholder="ex.: 80"
              rows={ports}
              separator="→"
              onChange={setPorts}
            />
          </div>
          {!nativeEngine && (
            <SwitchRow
              hint="Portas EXPOSE da imagem em portas aleatórias do host (-P)."
              isSelected={publishAll}
              label="Publicar todas as portas expostas"
              onChange={setPublishAll}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Hostname" placeholder="ex.: web-01" value={hostname} onChange={setHostname} />
            <TextInput
              label="Domínio"
              placeholder="ex.: interno.local"
              value={domainname}
              onChange={setDomainname}
            />
          </div>
          {nativeEngine ? (
            <Notice>
              No motor nativo os containers usam a rede bridge (NAT) do WSL. Redes nomeadas, aliases, DNS e
              env-file são recursos do motor CLI.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  className="flex flex-col gap-1.5"
                  selectedKey={network}
                  onSelectionChange={(key) => setNetwork(String(key))}
                >
                  <Label>Rede</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id={NO_NETWORK} textValue="Padrão — bridge">
                        Padrão — bridge
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {networks.map((n) => (
                        <ListBox.Item key={n.id || n.name} id={n.name} textValue={`${n.name} · ${n.driver}`}>
                          {n.name} · {n.driver}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextInput
                  isDisabled={network === NO_NETWORK}
                  hint="Outros nomes pelos quais o container responde na rede. Separe por vírgula."
                  label="Aliases na rede"
                  placeholder="ex.: web, site"
                  value={networkAliases}
                  onChange={setNetworkAliases}
                />
              </div>
              <TextInput
                isDisabled={network === NO_NETWORK}
                hint="IPv4 fixo dentro da rede escolhida (--ip). Precisa estar na sub-rede dela."
                label="Endereço IP"
                placeholder="ex.: 172.20.0.10"
                value={ip}
                onChange={setIp}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  hint="Servidores consultados dentro do container. Separe por vírgula."
                  label="Servidores DNS"
                  placeholder="ex.: 1.1.1.1, 8.8.8.8"
                  value={dns}
                  onChange={setDns}
                />
                <TextInput
                  hint="Sufixos tentados em nomes sem domínio. Separe por vírgula."
                  label="Domínios de busca"
                  placeholder="ex.: svc.local"
                  value={dnsSearch}
                  onChange={setDnsSearch}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <Label>Variáveis de ambiente</Label>
            <PairList
              addLabel="Adicionar variável"
              leftLabel="Nome da variável"
              leftPlaceholder="ex.: TZ"
              rightLabel="Valor da variável"
              rightPlaceholder="ex.: Etc/UTC"
              rows={envRows}
              separator="="
              onChange={setEnvRows}
            />
          </div>
          {!nativeEngine && (
            <div className="flex items-end gap-2">
              <TextInput
                className="flex-1"
                hint="Arquivo com uma variável KEY=valor por linha (--env-file)."
                label="Arquivo de variáveis"
                placeholder="ex.: C:\projeto\.env"
                value={envFile}
                onChange={setEnvFile}
              />
              <IconAction label="Escolher arquivo" variant="secondary" onPress={() => void pickEnvFile()}>
                <FolderOpen className="size-4" />
              </IconAction>
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="volumes">
          <div className="flex flex-col gap-2">
            <Label>Volumes anexados</Label>
            <PairList
              addLabel="Adicionar volume"
              leftLabel="Origem do volume"
              leftPlaceholder="volume ou pasta do host"
              rightLabel="Destino do volume"
              rightPlaceholder="ex.: /data"
              rows={volumeRows}
              separator="→"
              onChange={setVolumeRows}
            />
          </div>
          <div className="field-group flex flex-col gap-2 px-4 py-3">
            <span className="flex items-center gap-1.5">
              <Label>Criar e anexar um volume novo</Label>
              <Hint text="Opcional: o volume nomeado é criado antes do container iniciar e montado no destino." />
            </span>
            <div className="flex items-center gap-2 pt-1">
              <BareInput
                ariaLabel="Nome do volume novo"
                placeholder="nome do volume, ex.: dados"
                value={newVolume.left}
                onChange={(v) => setNewVolume({ ...newVolume, left: v })}
              />
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
              <BareInput
                ariaLabel="Destino do volume novo"
                placeholder="ex.: /data"
                value={newVolume.right}
                onChange={(v) => setNewVolume({ ...newVolume, right: v })}
              />
            </div>
          </div>
          {!nativeEngine && (
            <>
              <TextInput
                hint="Pontos de montagem em memória, separados por vírgula."
                label="Montagens tmpfs"
                placeholder="ex.: /cache, /tmp/build"
                value={tmpfs}
                onChange={setTmpfs}
              />
              <TextAreaInput
                hint="Forma completa da montagem (--mount), uma por linha. Aceita opções que o -v não tem, como readonly e bind-propagation."
                label="Montagens detalhadas"
                placeholder={'type=bind,source=C:\\projeto,target=/app,readonly'}
                rows={3}
                value={mounts}
                onChange={setMounts}
              />
            </>
          )}
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="resources">
          {nativeEngine ? (
            <Notice title="Limites valem para a sessão inteira">
              O SDK nativo não tem limites por container: CPU, memória e GPU são da sessão e ficam em Sistema,
              no bloco Tuning da sessão nativa. Healthcheck, shm e ulimits são recursos do motor CLI.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TextInput label="CPUs" placeholder="ex.: 1.5" value={cpus} onChange={setCpus} />
                <TextInput label="Memória" placeholder="ex.: 512M" value={memory} onChange={setMemory} />
                <TextInput label="/dev/shm" placeholder="ex.: 64M" value={shmSize} onChange={setShmSize} />
              </div>
              <TextInput
                hint="Formato nome=soft:hard, separados por vírgula."
                label="Ulimits"
                placeholder="ex.: nofile=1024:2048"
                value={ulimits}
                onChange={setUlimits}
              />
              <div className="field-group flex flex-col gap-3 px-4 py-3">
                <SwitchInput
                  hint="Ignora o healthcheck que veio na imagem (--no-healthcheck)."
                  isSelected={healthDisable}
                  label="Desativar healthcheck da imagem"
                  onChange={setHealthDisable}
                />
                {!healthDisable && (
                  <>
                    <TextInput
                      hint="Comando rodado periodicamente para marcar o container como saudável ou não."
                      label="Comando de healthcheck"
                      placeholder="ex.: curl -f http://localhost/ || exit 1"
                      value={healthCmd}
                      onChange={setHealthCmd}
                    />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <TextInput
                        label="Intervalo"
                        placeholder="30s"
                        value={healthInterval}
                        onChange={setHealthInterval}
                      />
                      <TextInput
                        label="Timeout"
                        placeholder="10s"
                        value={healthTimeout}
                        onChange={setHealthTimeout}
                      />
                      <TextInput
                        label="Tentativas"
                        placeholder="3"
                        value={healthRetries}
                        onChange={setHealthRetries}
                      />
                      <TextInput
                        label="Carência"
                        placeholder="30s"
                        value={healthStartPeriod}
                        onChange={setHealthStartPeriod}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </Tabs.Panel>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" id="advanced">
          <TextInput
            hint="Sobrescreve o comando padrão definido na imagem."
            label="Comando"
            placeholder={'ex.: sh -c "echo olá"'}
            value={command}
            onChange={setCommand}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Entrypoint"
              placeholder="ex.: /bin/sh"
              value={entrypoint}
              onChange={setEntrypoint}
            />
            <TextInput
              label="Diretório de trabalho"
              placeholder="ex.: /app"
              value={workdir}
              onChange={setWorkdir}
            />
          </div>
          {!nativeEngine && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  hint="Nome ou uid[:gid] com que o processo roda dentro do container."
                  label="Usuário"
                  placeholder="ex.: 1000:1000"
                  value={user}
                  onChange={setUser}
                />
                <TextInput
                  hint="Pares chave=valor separados por vírgula."
                  label="Labels"
                  placeholder="ex.: app=site, env=dev"
                  value={labels}
                  onChange={setLabels}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Sinal de parada"
                  placeholder="ex.: SIGTERM"
                  value={stopSignal}
                  onChange={setStopSignal}
                />
                <TextInput
                  hint="Segundos de espera antes do SIGKILL. -1 espera para sempre."
                  label="Timeout de parada"
                  placeholder="ex.: 10"
                  value={stopTimeout}
                  onChange={setStopTimeout}
                />
              </div>
            </>
          )}
          <SwitchRow
            hint="Descarta o container quando ele parar (--rm)."
            isSelected={rm}
            label="Remover ao parar"
            onChange={setRm}
          />
          <SwitchRow
            hint="Expõe a GPU ao container (--gpus all)."
            isSelected={gpus}
            label="Usar GPU"
            onChange={setGpus}
          />
        </Tabs.Panel>
      </Tabs>
    </AppModal>
  )
}
