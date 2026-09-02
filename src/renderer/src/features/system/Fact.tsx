import { Skeleton } from '@/design'
import { cn } from '@/lib/utils'

/**
 * Linha de dado das abas de Sistema: rótulo à esquerda, valor à direita.
 *
 * O rótulo não tem mais largura fixa — `w-36` funcionava na coluna larga e
 * espremia o valor a duas palavras por linha quando o mesmo `<dl>` caía numa
 * grade de duas colunas. Agora ele reserva um terço da linha, com um piso em
 * ch para o rótulo curto não colar no valor.
 */
export function Fact({
  label,
  children,
  className,
  divider = true
}: {
  label: string
  children: React.ReactNode
  className?: string
  /**
   * Desliga o hairline de baixo. Numa grade de duas colunas com UMA linha só,
   * `last:border-b-0` risca apenas a célula da esquerda — a última da grade —,
   * e a linha fica pela metade. Quem tem uma linha só não precisa de traço.
   */
  divider?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-baseline gap-4 py-2',
        divider && 'border-b border-separator last:border-b-0',
        className
      )}
    >
      <dt className="w-1/3 min-w-[9ch] max-w-[16ch] shrink-0 text-xs text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">{children}</dd>
    </div>
  )
}

/**
 * Espera pelo valor. Um traço não distingue "ainda não chegou" de "não tem" —
 * e as consultas desta view (FFI, leitura de arquivo) levam tempo visível.
 */
export function FactWait({ className }: { className?: string }): React.JSX.Element {
  return <Skeleton className={cn('h-3.5 w-24', className)} />
}
