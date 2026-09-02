/** Linha de dado dos blocos de Sistema: rótulo à esquerda, valor à direita. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-4 border-b border-separator py-2 last:border-b-0">
      <dt className="w-36 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  )
}
