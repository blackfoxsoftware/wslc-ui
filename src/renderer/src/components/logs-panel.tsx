import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ChevronDown, ChevronUp, Eraser, FolderOpen, ScrollText } from 'lucide-react'
import type { LogCategory, LogEntry, LogLevel } from '@shared/schemas'
import { Chip, IconAction, IconToggle, SearchInput, SelectInput, toast } from '@/design'
import { filterEntries, useLogsStore } from '@/features/logs/store'
import { cn } from '@/lib/utils'

/**
 * Painel de logs do app: barra fina acoplada ao rodapé do AppShell, retrátil.
 * As entradas vêm do processo main (buffer via logs:list + evento logs:entry).
 */

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Aviso',
  error: 'Erro'
}

const LEVEL_TONE: Record<LogLevel, string> = {
  debug: 'text-muted',
  info: 'text-accent',
  warn: 'text-warning',
  error: 'text-danger'
}

const CATEGORY_LABEL: Record<LogCategory, string> = {
  app: 'App',
  ipc: 'IPC',
  cli: 'CLI',
  native: 'Nativo',
  engine: 'Motor',
  stream: 'Streams',
  terminal: 'Terminal',
  update: 'Atualização'
}

const LEVEL_OPTIONS = (Object.keys(LEVEL_LABEL) as LogLevel[]).map((l) => ({
  id: l,
  label: `${LEVEL_LABEL[l]}+`
}))

const CATEGORY_OPTIONS = [
  { id: 'all', label: 'Todas' },
  ...(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((c) => ({ id: c, label: CATEGORY_LABEL[c] }))
]

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour12: false })
}

function LogRow({ entry }: { entry: LogEntry }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-separator/60 last:border-b-0">
      <button
        className={cn(
          'flex w-full items-baseline gap-2.5 px-3 py-1 text-left font-mono text-xs hover:bg-default/60',
          entry.detail && 'cursor-pointer'
        )}
        title={entry.detail ? 'Ver detalhe' : undefined}
        onClick={() => entry.detail && setExpanded((v) => !v)}
      >
        <span className="shrink-0 text-muted">{formatTime(entry.ts)}</span>
        <span className={cn('w-12 shrink-0', LEVEL_TONE[entry.level])}>
          {LEVEL_LABEL[entry.level].toLowerCase()}
        </span>
        <span className="w-16 shrink-0 text-muted">{CATEGORY_LABEL[entry.category].toLowerCase()}</span>
        <span className="min-w-0 break-words">{entry.message}</span>
      </button>
      {expanded && entry.detail && (
        <pre className="inset-well mx-3 mb-2 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-muted">
          {entry.detail}
        </pre>
      )}
    </div>
  )
}

export default function LogsPanel(): React.JSX.Element {
  const entries = useLogsStore((s) => s.entries)
  const panelOpen = useLogsStore((s) => s.panelOpen)
  const level = useLogsStore((s) => s.level)
  const category = useLogsStore((s) => s.category)
  const query = useLogsStore((s) => s.query)
  const autoScroll = useLogsStore((s) => s.autoScroll)
  const load = useLogsStore((s) => s.load)
  const clear = useLogsStore((s) => s.clear)
  const togglePanel = useLogsStore((s) => s.togglePanel)
  const setLevel = useLogsStore((s) => s.setLevel)
  const setCategory = useLogsStore((s) => s.setCategory)
  const setQuery = useLogsStore((s) => s.setQuery)
  const setAutoScroll = useLogsStore((s) => s.setAutoScroll)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Carrega o buffer já na montagem para os contadores da barra fazerem sentido.
  useEffect(() => {
    void load()
  }, [load])

  const filtered = filterEntries(entries, level, category, query)
  const errorCount = entries.filter((e) => e.level === 'error').length
  const warnCount = entries.filter((e) => e.level === 'warn').length

  const filteredCount = filtered.length
  useEffect(() => {
    if (panelOpen && autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- rola ao chegar entrada nova
  }, [filteredCount, autoScroll, panelOpen])

  const clearAll = async (): Promise<void> => {
    await clear()
    toast.success('Logs limpos (o arquivo em disco é preservado).')
  }

  return (
    <section className="flex shrink-0 flex-col border-t border-separator">
      <button
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Recolher logs' : 'Expandir logs'}
        className="flex h-9 w-full items-center gap-2.5 px-4 text-sm hover:bg-default/60"
        onClick={togglePanel}
      >
        <ScrollText className="size-4 text-muted" />
        <strong className="font-medium">Logs</strong>
        <Chip color="default" size="sm" variant="soft">
          <Chip.Label>{entries.length}</Chip.Label>
        </Chip>
        {errorCount > 0 && (
          <Chip color="danger" size="sm" variant="soft">
            <Chip.Label>
              {errorCount} erro{errorCount > 1 ? 's' : ''}
            </Chip.Label>
          </Chip>
        )}
        {warnCount > 0 && (
          <Chip color="warning" size="sm" variant="soft">
            <Chip.Label>
              {warnCount} aviso{warnCount > 1 ? 's' : ''}
            </Chip.Label>
          </Chip>
        )}
        <div className="flex-1" />
        {panelOpen ? (
          <ChevronDown className="size-4 text-muted" />
        ) : (
          <ChevronUp className="size-4 text-muted" />
        )}
      </button>

      {panelOpen && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-separator px-4 py-2">
            <SearchInput
              ariaLabel="Filtrar mensagens"
              placeholder="Filtrar mensagens…"
              value={query}
              onChange={setQuery}
            />
            <SelectInput
              hideLabel
              className="w-28 flex-none"
              label="Nível mínimo"
              options={LEVEL_OPTIONS}
              value={level}
              onChange={(v) => setLevel(v as LogLevel)}
            />
            <SelectInput
              hideLabel
              className="w-32 flex-none"
              label="Categoria"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => setCategory(v as LogCategory | 'all')}
            />
            <span className="shrink-0 text-xs text-muted">
              {filtered.length} de {entries.length}
            </span>
            <div className="flex items-center gap-1.5">
              <IconToggle isSelected={autoScroll} label="Auto-rolagem" onChange={setAutoScroll}>
                <ArrowDownToLine className="size-4" />
              </IconToggle>
              <IconAction
                label="Abrir pasta de logs"
                variant="secondary"
                onPress={() => void window.wslcApi.openLogsFolder()}
              >
                <FolderOpen className="size-4" />
              </IconAction>
              <IconAction label="Limpar logs" variant="secondary" onPress={() => void clearAll()}>
                <Eraser className="size-4" />
              </IconAction>
            </div>
          </div>

          <div ref={scrollRef} className="h-60 overflow-y-auto border-t border-separator scrollbar">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                Nenhuma entrada com os filtros atuais.
              </div>
            ) : (
              filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
            )}
          </div>
        </>
      )}
    </section>
  )
}
