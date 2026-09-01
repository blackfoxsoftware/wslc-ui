import { Link, useLocation } from '@tanstack/react-router'
import { Boxes, Container, HardDrive, Network, Settings2 } from 'lucide-react'
import { Tooltip } from '@/design'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'

const NAV = [
  { to: '/containers', label: 'Containers', icon: Container },
  { to: '/images', label: 'Imagens', icon: Boxes },
  { to: '/volumes', label: 'Volumes', icon: HardDrive },
  { to: '/networks', label: 'Redes', icon: Network },
  { to: '/system', label: 'Sistema', icon: Settings2 }
] as const

/**
 * Rail de navegação. Recolhe para uma coluna de ícones quadrados, com tooltip
 * em cada item nesse estado.
 *
 * O item é centralizado pelo <li>, não pelo próprio link: recolhido, o
 * Tooltip.Trigger do HeroUI embrulha o link num <div> que só ocupa a largura
 * do conteúdo, então `justify-center` dentro do link não teria efeito algum.
 */
export default function AppRail(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.railCollapsed)
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'flex shrink-0 flex-col gap-1 p-2 transition-[width] duration-200 ease-out-quart motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      <ul className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to)
          const item = (
            <Link
              className={cn(
                'group relative flex items-center rounded-md text-sm transition-colors motion-reduce:transition-none',
                active
                  ? 'bg-accent/12 font-medium text-foreground'
                  : 'text-muted hover:bg-default hover:text-foreground',
                collapsed ? 'size-9 justify-center' : 'h-8 w-full gap-2.5 px-2.5'
              )}
              to={to}
            >
              {active && !collapsed && (
                <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />
              )}
              <Icon className={cn('size-4 shrink-0', active && 'text-accent')} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )

          return (
            <li key={to} className={cn('flex', collapsed && 'justify-center')}>
              {collapsed ? (
                <Tooltip delay={300}>
                  <Tooltip.Trigger>{item}</Tooltip.Trigger>
                  <Tooltip.Content placement="right">{label}</Tooltip.Content>
                </Tooltip>
              ) : (
                item
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
