import { useEffect, useState } from 'react'
import {
  Boxes,
  Download,
  EllipsisVertical,
  Eraser,
  FileDown,
  FileUp,
  Hammer,
  Info,
  KeyRound,
  LogOut,
  PackagePlus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  Upload
} from 'lucide-react'
import type { ImageInfo } from '@shared/schemas'
import InspectSheet from '@/components/inspect-sheet'
import {
  BareInput,
  Button,
  Cell,
  Chip,
  Column,
  DataTable,
  Dropdown,
  Empty,
  ErrorAlert,
  IconAction,
  Label,
  Mono,
  PageBody,
  PageHeader,
  PageShell,
  Row,
  SearchInput,
  SectionTitle,
  SelectInput,
  Separator,
  Spinner,
  StateChip,
  Tabs,
  Tooltip
} from '@/design'
import { usePolling } from '@/hooks/usePolling'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import { useStreamStore } from '@/stores/stream-store'
import BuildImageDialog from './BuildImageDialog'
import { CATEGORIES, CATEGORY_LABELS, IMAGE_CATALOG, type CatalogCategory } from './catalog'
import ImportTarballDialog from './ImportTarballDialog'
import RegistryLoginDialog from './RegistryLoginDialog'
import RegistryLogoutDialog from './RegistryLogoutDialog'
import { useRegistryStore } from './registry-store'
import { useImagesStore } from './store'
import TagImageDialog from './TagImageDialog'

const refOf = (img: ImageInfo): string =>
  img.repository && img.tag ? `${img.repository}:${img.tag}` : img.id

/** Normaliza "docker.io/library/nginx" → "nginx" para comparar com o catálogo. */
function shortRepo(repo: string): string {
  return repo.replace(/^docker\.io\/(library\/)?/, '')
}

const CATEGORY_OPTIONS = [
  { id: 'all', label: 'Todas as categorias' },
  ...CATEGORIES.map((cat) => ({ id: cat, label: CATEGORY_LABELS[cat] }))
]

export default function ImagesView(): React.JSX.Element {
  const images = useImagesStore((s) => s.images)
  const error = useImagesStore((s) => s.error)
  const refresh = useImagesStore((s) => s.refresh)
  const removeImage = useImagesStore((s) => s.remove)
  const saveImage = useImagesStore((s) => s.save)
  const pruneUnused = useImagesStore((s) => s.pruneUnused)
  const removeAll = useImagesStore((s) => s.removeAll)
  const openStream = useStreamStore((s) => s.open)
  const hubResults = useRegistryStore((s) => s.results)
  const hubSearching = useRegistryStore((s) => s.searching)
  const hubError = useRegistryStore((s) => s.error)
  const hubSearch = useRegistryStore((s) => s.search)
  const hubClear = useRegistryStore((s) => s.clear)
  const [pullRef, setPullRef] = useState('')
  const [showBuild, setShowBuild] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [inspectRef, setInspectRef] = useState<string | null>(null)
  const [tagSource, setTagSource] = useState<string | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [category, setCategory] = useState<'all' | CatalogCategory>('all')
  const engineStatus = useEngineStore((s) => s.status)
  const loadEngine = useEngineStore((s) => s.load)
  const engine = engineStatus?.engine
  const nativeEngine = engine === 'native'

  usePolling(refresh, 10_000)

  useEffect(() => {
    void loadEngine()
  }, [loadEngine])

  // Trocou o motor em Sistema → a lista vem de outra sessão; recarrega na hora.
  useEffect(() => {
    if (engine) void refresh()
  }, [engine, refresh])

  // Busca no Docker Hub com debounce, em paralelo ao filtro local.
  useEffect(() => {
    const query = catalogSearch.trim()
    if (query.length < 2) {
      hubClear()
      return
    }
    const timer = setTimeout(() => void hubSearch(query), 500)
    return () => clearTimeout(timer)
  }, [catalogSearch, hubSearch, hubClear])

  const showHub = catalogSearch.trim().length >= 2

  const filteredCatalog = IMAGE_CATALOG.filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    const query = catalogSearch.trim().toLowerCase()
    if (!query) return true
    return (
      item.name.toLowerCase().includes(query) ||
      item.ref.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    )
  })

  const pull = async (): Promise<void> => {
    const ref = pullRef.trim()
    if (!ref) return
    await openStream(`Pull de ${ref}`, () => window.wslcApi.pullImage(ref))
    setPullRef('')
  }

  const push = (img: ImageInfo): void => {
    const ref = refOf(img)
    void openStream(`Push de ${ref}`, () => window.wslcApi.pushImage(ref))
  }

  const loadTarball = async (): Promise<void> => {
    const path = await window.wslcApi.pickFile('Escolher o tarball salvo por image save', ['tar'])
    if (!path) return
    const name = path.split(/[\\/]/).pop() ?? path
    void openStream(`Load de ${name}`, () => window.wslcApi.loadImageTarball(path))
  }

  const remove = async (img: ImageInfo): Promise<void> => {
    const ref = refOf(img)
    const ok = await confirmDialog({
      title: `Remover a imagem "${ref}"?`,
      description: 'Containers que dependem dela deixarão de funcionar.',
      confirmLabel: 'Remover',
      destructive: true
    })
    if (ok) void removeImage(img)
  }

  const removeUnused = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover imagens sem uso?',
      description: 'Imagens que não são usadas por nenhum container serão removidas.',
      confirmLabel: 'Remover sem uso',
      destructive: true
    })
    if (ok) void pruneUnused()
  }

  const removeEverything = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Remover TODAS as imagens?',
      description: 'Todas as imagens locais serão removidas. Essa ação não pode ser desfeita.',
      confirmLabel: 'Remover tudo',
      destructive: true
    })
    if (ok) void removeAll()
  }

  const isInstalled = (ref: string): boolean => {
    const repo = shortRepo(ref.split(':')[0])
    return images.some((img) => shortRepo(img.repository) === repo)
  }

  const pullFromCatalog = (ref: string): void => {
    void openStream(`Pull de ${ref}`, () => window.wslcApi.pullImage(ref))
  }

  return (
    <PageShell fill>
      <PageHeader
        actions={
          <>
            <BareInput
              ariaLabel="Imagem para baixar"
              className="w-64 flex-none"
              placeholder="Baixar imagem — ex.: nginx:latest"
              value={pullRef}
              onChange={setPullRef}
              onSubmitKey={() => void pull()}
            />
            <IconAction
              isDisabled={!pullRef.trim()}
              label="Baixar imagem (pull)"
              variant="primary"
              onPress={() => void pull()}
            >
              <Download className="size-4" />
            </IconAction>
            {!nativeEngine && (
              <IconAction
                label="Construir imagem a partir de um Containerfile"
                variant="secondary"
                onPress={() => setShowBuild(true)}
              >
                <Hammer className="size-4" />
              </IconAction>
            )}
            <IconAction label="Atualizar" variant="secondary" onPress={() => void refresh()}>
              <RefreshCw className="size-4" />
            </IconAction>
            <Dropdown>
              <Button aria-label="Mais ações" isIconOnly size="sm" variant="secondary">
                <EllipsisVertical className="size-4" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu>
                  <Dropdown.Item id="login" textValue="Login em registry" onAction={() => setShowLogin(true)}>
                    <KeyRound className="size-4" />
                    <Label>Login em registry…</Label>
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="logout"
                    textValue="Logout de registry"
                    onAction={() => setShowLogout(true)}
                  >
                    <LogOut className="size-4" />
                    <Label>Logout de registry…</Label>
                  </Dropdown.Item>
                  <Separator />
                  <Dropdown.Item
                    id="load"
                    textValue="Carregar imagem salva"
                    onAction={() => void loadTarball()}
                  >
                    <FileUp className="size-4" />
                    <Label>Carregar imagem salva…</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="import" textValue="Importar rootfs" onAction={() => setShowImport(true)}>
                    <PackagePlus className="size-4" />
                    <Label>Importar rootfs…</Label>
                  </Dropdown.Item>
                  {!nativeEngine && (
                    <Dropdown.Item
                      id="prune"
                      textValue="Remover imagens sem uso"
                      onAction={() => void removeUnused()}
                    >
                      <Eraser className="size-4" />
                      <Label>Remover imagens sem uso</Label>
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item
                    id="remove-all"
                    textValue="Remover todas as imagens"
                    variant="danger"
                    onAction={() => void removeEverything()}
                  >
                    <Trash2 className="size-4" />
                    <Label>Remover todas as imagens</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </>
        }
        meta={
          nativeEngine ? (
            <Tooltip delay={300}>
              <Tooltip.Trigger>
                <StateChip label="motor nativo" tone="accent" />
              </Tooltip.Trigger>
              <Tooltip.Content>
                Imagens pela sessão nativa &quot;WslcUi&quot; (wslcsdk): pull e push com progresso por camada,
                login em registry, tag, load/import de tarball e remoção. Build, inspect e save só existem no
                motor CLI.
              </Tooltip.Content>
            </Tooltip>
          ) : undefined
        }
        title="Imagens"
      />

      <PageBody className="min-h-0 flex-1">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <Tabs className="min-h-0 flex-1" defaultSelectedKey="local">
          <Tabs.List>
            <Tabs.Tab id="local">
              Locais
              <Chip className="ms-1.5" color="default" size="sm" variant="soft">
                <Chip.Label>{images.length}</Chip.Label>
              </Chip>
            </Tabs.Tab>
            <Tabs.Tab id="catalog">Catálogo</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel className="flex min-h-0 flex-1 flex-col p-0 pt-4" id="local">
            <DataTable
              ariaLabel="Imagens locais"
              emptyState={
                <Empty
                  description="Baixe uma pelo Catálogo ou pelo campo de pull no topo da página."
                  icon={<Boxes />}
                  title="Nenhuma imagem local"
                />
              }
              fill
              footer={
                <span>
                  {images.length} {images.length === 1 ? 'imagem local' : 'imagens locais'}
                </span>
              }
              head={
                <>
                  <Column isRowHeader>Repositório</Column>
                  <Column>Tag</Column>
                  <Column>ID</Column>
                  <Column>Criada</Column>
                  <Column>Tamanho</Column>
                  <Column width={90}>Ações</Column>
                </>
              }
            >
              {images.map((img) => (
                <Row
                  key={`${img.repository}:${img.tag}:${img.id}`}
                  id={`${img.repository}:${img.tag}:${img.id}`}
                >
                  <Cell>
                    <Mono>{img.repository}</Mono>
                  </Cell>
                  <Cell>{img.tag}</Cell>
                  <Cell>
                    <Mono className="text-muted">{img.id.slice(0, 12)}</Mono>
                  </Cell>
                  <Cell>{img.created}</Cell>
                  <Cell>{img.size}</Cell>
                  <Cell>
                    <div className="flex justify-end">
                      <Dropdown>
                        <Button aria-label="Ações da imagem" isIconOnly size="sm" variant="ghost">
                          <EllipsisVertical className="size-4" />
                        </Button>
                        <Dropdown.Popover>
                          <Dropdown.Menu>
                            {!nativeEngine && (
                              <Dropdown.Item
                                id="inspect"
                                textValue="Inspecionar"
                                onAction={() => setInspectRef(refOf(img))}
                              >
                                <Info className="size-4" />
                                <Label>Inspecionar</Label>
                              </Dropdown.Item>
                            )}
                            <Dropdown.Item
                              id="tag"
                              textValue="Nova tag"
                              onAction={() => setTagSource(refOf(img))}
                            >
                              <Tag className="size-4" />
                              <Label>Nova tag…</Label>
                            </Dropdown.Item>
                            <Dropdown.Item
                              id="push"
                              textValue="Push para registry"
                              onAction={() => push(img)}
                            >
                              <Upload className="size-4" />
                              <Label>Push para registry</Label>
                            </Dropdown.Item>
                            {!nativeEngine && (
                              <Dropdown.Item
                                id="save"
                                textValue="Salvar como tar"
                                onAction={() => void saveImage(img)}
                              >
                                <FileDown className="size-4" />
                                <Label>Salvar como arquivo…</Label>
                              </Dropdown.Item>
                            )}
                            <Dropdown.Item
                              id="remove"
                              textValue="Remover"
                              variant="danger"
                              onAction={() => void remove(img)}
                            >
                              <Trash2 className="size-4" />
                              <Label>Remover</Label>
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown>
                    </div>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          </Tabs.Panel>

          <Tabs.Panel
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-0 pt-4 scrollbar"
            id="catalog"
          >
            <DataTable
              ariaLabel="Catálogo de imagens"
              emptyState={
                <Empty
                  description="Nada no catálogo com esse filtro. Os resultados do Docker Hub aparecem abaixo."
                  icon={<Boxes />}
                  title="Sem resultados no catálogo"
                />
              }
              fill={!showHub}
              footer={
                <span>
                  {filteredCatalog.length} de {IMAGE_CATALOG.length} imagens do catálogo
                </span>
              }
              head={
                <>
                  <Column isRowHeader>Nome</Column>
                  <Column>Referência</Column>
                  <Column>Categoria</Column>
                  <Column>Descrição</Column>
                  <Column width={130}>Ações</Column>
                </>
              }
              toolbar={
                <>
                  <SearchInput
                    ariaLabel="Filtrar catálogo"
                    placeholder="Filtrar o catálogo e buscar no Docker Hub…"
                    value={catalogSearch}
                    onChange={setCatalogSearch}
                  />
                  <SelectInput
                    className="w-52 flex-none"
                    hideLabel
                    label="Categoria"
                    options={CATEGORY_OPTIONS}
                    value={category}
                    onChange={(v) => setCategory(v as typeof category)}
                  />
                </>
              }
            >
              {filteredCatalog.map((item) => {
                const installed = isInstalled(item.ref)
                return (
                  <Row key={item.ref} id={item.ref}>
                    <Cell>
                      <span className="flex items-center gap-2 font-medium">
                        {item.name}
                        {installed && <StateChip label="baixada" tone="success" />}
                      </span>
                    </Cell>
                    <Cell>
                      <Mono>{item.ref}</Mono>
                    </Cell>
                    <Cell>
                      <StateChip label={CATEGORY_LABELS[item.category]} />
                    </Cell>
                    <Cell>
                      <span className="text-muted">{item.description}</span>
                    </Cell>
                    <Cell>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant={installed ? 'secondary' : 'primary'}
                          onPress={() => pullFromCatalog(item.ref)}
                        >
                          <Download className="size-4" />
                          {installed ? 'Atualizar' : 'Pull'}
                        </Button>
                      </div>
                    </Cell>
                  </Row>
                )
              })}
            </DataTable>

            {showHub && (
              <>
                <SectionTitle
                  actions={hubSearching ? <Spinner size="sm" /> : undefined}
                  description={`Resultados do Docker Hub para “${catalogSearch.trim()}”.`}
                >
                  Docker Hub
                </SectionTitle>
                {hubError && <ErrorAlert>Busca no Docker Hub falhou: {hubError}</ErrorAlert>}
                {!hubError && (
                  <DataTable
                    ariaLabel="Resultados do Docker Hub"
                    emptyState={
                      hubSearching ? undefined : (
                        <Empty
                          description={`Nenhum resultado no Docker Hub para “${catalogSearch.trim()}”.`}
                          icon={<Boxes />}
                          title="Sem resultados"
                        />
                      )
                    }
                    head={
                      <>
                        <Column isRowHeader>Imagem</Column>
                        <Column width={110}>Estrelas</Column>
                        <Column>Descrição</Column>
                        <Column width={110}>Ações</Column>
                      </>
                    }
                  >
                    {hubResults.map((result) => (
                      <Row key={result.name} id={result.name}>
                        <Cell>
                          <span className="flex items-center gap-2">
                            <Mono>{result.name}</Mono>
                            {result.official && <StateChip label="oficial" tone="accent" />}
                          </span>
                        </Cell>
                        <Cell>
                          <span className="flex items-center gap-1 font-mono text-xs text-muted">
                            <Star className="size-3 fill-current text-warning" />
                            {result.stars.toLocaleString('pt-BR')}
                          </span>
                        </Cell>
                        <Cell>
                          <span className="text-muted">{result.description || '-'}</span>
                        </Cell>
                        <Cell>
                          <div className="flex justify-end">
                            <Button size="sm" onPress={() => pullFromCatalog(`${result.name}:latest`)}>
                              <Download className="size-4" />
                              Pull
                            </Button>
                          </div>
                        </Cell>
                      </Row>
                    ))}
                  </DataTable>
                )}
              </>
            )}
          </Tabs.Panel>
        </Tabs>
      </PageBody>

      {showBuild && <BuildImageDialog onClose={() => setShowBuild(false)} />}
      {showImport && <ImportTarballDialog onClose={() => setShowImport(false)} />}
      {showLogin && <RegistryLoginDialog nativeEngine={nativeEngine} onClose={() => setShowLogin(false)} />}

      {showLogout && (
        <RegistryLogoutDialog nativeEngine={nativeEngine} onClose={() => setShowLogout(false)} />
      )}
      {inspectRef && (
        <InspectSheet
          description="Saída de wslc image inspect"
          load={() => window.wslcApi.inspectImage(inspectRef)}
          title={inspectRef}
          onClose={() => setInspectRef(null)}
        />
      )}
      {tagSource && <TagImageDialog source={tagSource} onClose={() => setTagSource(null)} />}
    </PageShell>
  )
}
