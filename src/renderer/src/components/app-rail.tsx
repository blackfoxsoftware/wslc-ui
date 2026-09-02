import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Tooltip } from '@/design'
import { cn } from '@/lib/utils'
import { NAV } from '@/navigation'
import { useUiStore } from '@/stores/ui-store'

/**
 * Rail de navegação. Recolhe para uma coluna de ícones quadrados, com tooltip
 * em cada item nesse estado.
 *
 * O item é centralizado pelo <li>, não pelo próprio link: recolhido, o
 * Tooltip.Trigger do HeroUI embrulha o link num <div> que só ocupa a largura
 * do conteúdo, então `justify-center` dentro do link não teria efeito algum.
 *
 * O realce do item ativo é UM elemento, atrás da lista, que desliza até a caixa
 * do item escolhido — e não um fundo em cada link, que acenderia num lugar e
 * apagaria no outro.
 *
 * A caixa é MEDIDA do próprio link, e remedida sempre que a lista muda de
 * tamanho: nada aqui depende de a linha ter 32px ou de o espaçamento ser 2px.
 * Enquanto o rail fecha, o ResizeObserver dispara a cada quadro do layout e o
 * marcador acompanha a caixa de verdade, sem transição (ver `instant`).
 *
 * E isto NÃO é uma view transition, o que é a razão de ser: o marcador está
 * sempre na tela e só muda de lugar, então quem interpola é o layout de verdade.
 * View transition serve para região que TROCA de conteúdo (a página, o painel de
 * uma aba).
 */

interface MarkerBox {
  top: number
  left: number
  width: number
  height: number
  /**
   * Chegar aqui sem transição.
   *
   * Verdadeiro quando a caixa mudou porque o LAYOUT mudou (o rail recolhendo):
   * aí o alvo está em movimento, e deslizar até ele seria correr atrás — o
   * marcador ficaria bambo, sempre um passo atrás do ícone. Falso na troca de
   * tela, que é o único caso em que a caixa antiga e a nova estão as duas
   * paradas e o deslize significa algo.
   */
  instant: boolean
}

export default function AppRail(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.railCollapsed)
  const pathname = useLocation({ select: (l) => l.pathname })
  const listRef = useRef<HTMLUListElement>(null)
  const lastBox = useRef<string>('')
  const [marker, setMarker] = useState<MarkerBox | null>(null)

  const activeTo = NAV.find(({ to }) => pathname.startsWith(to))?.to

  // Antes da pintura: no primeiro render o marcador já sai no lugar certo, sem
  // deslizar do canto.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = (instant: boolean): void => {
      const item = activeTo ? list.querySelector<HTMLElement>(`a[data-nav="${activeTo}"]`) : null
      if (!item) {
        lastBox.current = ''
        setMarker(null)
        return
      }
      const box = item.getBoundingClientRect()
      const base = list.getBoundingClientRect()
      const next = {
        top: box.top - base.top,
        left: box.left - base.left,
        width: box.width,
        height: box.height,
        instant
      }

      // Medição que não mudou nada não vira render — e isso não é economia, é
      // correção: `observe()` entrega uma primeira medição sozinho, que numa
      // troca de tela chegaria com `instant` no MEIO do deslize e o cortaria.
      const assinatura = `${next.top},${next.left},${next.width},${next.height}`
      if (assinatura === lastBox.current) return
      lastBox.current = assinatura
      setMarker(next)
    }

    measure(false)
    const observer = new ResizeObserver(() => measure(true))
    observer.observe(list)
    return () => observer.disconnect()
  }, [activeTo])

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'flex shrink-0 flex-col gap-1 p-2 transition-[width] duration-200 ease-out-quart motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      <ul ref={listRef} className="relative flex flex-col gap-0.5">
        {marker && (
          <span
            aria-hidden
            className="rail-marker absolute top-0 left-0 rounded-md bg-accent/12"
            data-instant={marker.instant || undefined}
            style={{
              translate: `${marker.left}px ${marker.top}px`,
              width: marker.width,
              height: marker.height
            }}
          >
            {/* Barra de acento: filha do marcador, então viaja junto de graça. */}
            {!collapsed && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
          </span>
        )}

        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === activeTo
          const item = (
            <Link
              className={cn(
                'group relative flex items-center rounded-md text-sm transition-colors motion-reduce:transition-none',
                active ? 'font-medium text-foreground' : 'text-muted hover:bg-default hover:text-foreground',
                collapsed ? 'size-9 justify-center' : 'h-8 w-full gap-2.5 px-2.5'
              )}
              data-nav={to}
              to={to}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors motion-reduce:transition-none',
                  active && 'text-accent'
                )}
              />
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
