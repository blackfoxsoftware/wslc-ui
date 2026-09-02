import { cn } from '@/lib/utils'

/**
 * Estruturas de página do design system.
 *
 * Regra de composição: a lâmina de vidro da janela já é a superfície. Uma view
 * NÃO empilha cards em cima dela — separa conteúdo com hairline e espaço. O
 * único elemento que ganha material próprio é o cabeçalho fixo, porque o
 * conteúdo passa por baixo dele ao rolar.
 */

interface PageShellProps {
  children: React.ReactNode
  className?: string
}

/**
 * Página que rola inteira: usada onde o conteúdo é texto e formulário.
 *
 * Nas views de lista use `fill`: aí a página não rola: quem rola é a tabela,
 * por dentro da própria moldura. Sem isso o container flex fica com altura
 * automática (min-h-full) e o `flex-1` da tabela não tem o que dividir — ela
 * cresce com o conteúdo e vaza para fora da janela.
 */
export function PageShell({
  children,
  className,
  fill
}: PageShellProps & { fill?: boolean }): React.JSX.Element {
  // `vt-page` marca a região que troca quando se muda de tela (design/motion.css).
  // Como o cabeçalho aqui dentro também é nomeado, ele sai deste snapshot e fica
  // parado enquanto o corpo desliza — sem precisar de wrapper novo.
  if (fill) {
    return (
      <div className={cn('vt-page flex min-h-0 flex-1 flex-col overflow-hidden', className)}>{children}</div>
    )
  }
  return (
    <div className={cn('vt-page min-h-0 flex-1 overflow-y-auto scrollbar', className)}>
      <div className="flex min-h-full flex-col">{children}</div>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  /** Chip ou aviso curto ao lado do título (estado do motor, contagem…). */
  meta?: React.ReactNode
  description?: string
  actions?: React.ReactNode
  /**
   * Fecha o cabeçalho sem a borda de baixo, para quem vem em seguida fechá-lo.
   *
   * É o caso de uma view em abas: a faixa de abas fica logo abaixo, com o
   * hairline dela, e duas linhas a 36px de distância só somariam ruído. As
   * abas NÃO podem morar aqui dentro — a variante `secondary` do HeroUI é
   * escrita em `> .tabs__list-container`, e o container precisa ser filho
   * direto do `<Tabs>`.
   */
  flush?: boolean
}

export function PageHeader({ title, meta, description, actions, flush }: PageHeaderProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'vt-page-header page-bar sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3.5',
        flush ? 'pb-2.5' : 'border-b border-border'
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-lg font-semibold tracking-tight">{title}</h1>
          {meta}
        </div>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Faixa de conteúdo com o respiro lateral padrão das views. */
export function PageBody({ children, className }: PageShellProps): React.JSX.Element {
  return <div className={cn('flex flex-col gap-5 px-6 py-5', className)}>{children}</div>
}

interface GroupProps {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}

/**
 * Painel de conteúdo (nível 1 da escala de superfície): mesmo fundo e mesma
 * moldura do painel de dados (`DataTable`), para os dois conviverem na mesma
 * tela sem parecerem coisas diferentes. Sem sombra e sem card aninhado.
 */
export function Group({
  children,
  className,
  title,
  description,
  actions,
  icon
}: GroupProps): React.JSX.Element {
  return (
    <section className={cn('rounded-md border border-border bg-surface', className)}>
      {(title || actions) && (
        <div className="flex items-start gap-3 border-b border-border px-5 py-3">
          {icon && <span className="mt-0.5 text-accent [&_svg]:size-4.5">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(title || actions ? 'p-5' : 'p-5')}>{children}</div>
    </section>
  )
}

/** Título de seção solto, para blocos que não precisam de contorno. */
export function SectionTitle({
  children,
  description,
  actions
}: {
  children: React.ReactNode
  description?: string
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-sm font-semibold tracking-tight">{children}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
