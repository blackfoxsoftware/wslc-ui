import { Chip, Meter, Table } from '@heroui/react'
import { cn } from '@/lib/utils'

/**
 * Exibição de dados.
 *
 * A tabela é o conteúdo principal das views de lista, então ela é um painel de
 * verdade — moldura hairline, fundo de superfície, cabeçalho fixo e, quando
 * precisa, uma barra de filtros na própria moldura. Assim a lista ocupa toda a
 * área disponível em vez de flutuar solta no meio da página.
 */

interface DataTableProps {
  ariaLabel: string
  head: React.ReactNode
  children: React.ReactNode
  /** Filtros e busca da lista: ficam na faixa superior do painel. */
  toolbar?: React.ReactNode
  /** Contagem, dica ou aviso curto na faixa inferior. */
  footer?: React.ReactNode
  emptyState?: React.ReactNode
  /** Estica o painel até o fim da área e rola só as linhas. */
  fill?: boolean
  className?: string
}

export function DataTable({
  ariaLabel,
  head,
  children,
  toolbar,
  footer,
  emptyState,
  fill,
  className
}: DataTableProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface',
        fill && 'min-h-0 flex-1',
        className
      )}
    >
      {toolbar && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          {toolbar}
        </div>
      )}
      <Table className={cn(fill && 'table-fill')} variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label={ariaLabel}>
            <Table.Header>{head}</Table.Header>
            <Table.Body renderEmptyState={emptyState ? () => emptyState : undefined}>{children}</Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {footer && (
        <div className="flex min-w-0 items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          {footer}
        </div>
      )}
    </div>
  )
}

export const Column = Table.Column
export const Row = Table.Row
export const Cell = Table.Cell

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

interface StateChipProps {
  label: string
  tone?: ChipColor
  className?: string
}

/**
 * Estado semântico (running, parado, erro). Sempre com texto: cor nunca é a
 * única portadora da informação.
 */
export function StateChip({ label, tone = 'default', className }: StateChipProps): React.JSX.Element {
  return (
    <Chip className={cn('capitalize', className)} color={tone} size="sm" variant="soft">
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  )
}

const DOT_TONE: Record<ChipColor, string> = {
  success: 'bg-success shadow-[0_0_8px] shadow-success/60',
  danger: 'bg-danger',
  warning: 'bg-warning',
  accent: 'bg-accent',
  default: 'bg-muted'
}

/** Marcador de estado ao lado do nome. Só para estado real de recurso. */
export function StateDot({ tone = 'default', className }: { tone?: ChipColor; className?: string }) {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT_TONE[tone], className)} />
}

interface MetricProps {
  /** Percentual já calculado (0-100). */
  percent?: number
  label: string
  ariaLabel: string
}

/**
 * Número tabular + trilho fino. Usado em CPU/memória por container.
 *
 * `Meter`, não `ProgressBar`: uso de CPU é uma MEDIÇÃO dentro de uma faixa,
 * não progresso rumo a uma conclusão. A diferença é audível — um leitor de
 * tela anuncia progressbar como tarefa em andamento, o que faria parecer que
 * o container está fazendo alguma coisa que vai terminar.
 */
export function Metric({ percent, label, ariaLabel }: MetricProps): React.JSX.Element {
  if (percent === undefined) return <span className="text-muted">-</span>
  const tone = percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'accent'
  return (
    <Meter aria-label={ariaLabel} className="gap-1" color={tone} size="sm" value={Math.min(100, percent)}>
      <span className="font-mono text-xs text-foreground">{label}</span>
      <Meter.Track className="h-1">
        <Meter.Fill />
      </Meter.Track>
    </Meter>
  )
}

/** Valor monoespaçado para IDs, tamanhos, portas e caminhos. */
export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs', className)}>{children}</span>
}
