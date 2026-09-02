import { Boxes, Container, HardDrive, Network, Settings2 } from 'lucide-react'
import { prefersReducedMotion, type TransitionTypes } from '@/lib/view-transition'

/**
 * As telas do app, na ordem em que aparecem no rail.
 *
 * A ordem não é só desenho de menu: ela dá o SENTIDO da transição entre telas
 * (descer no rail = o conteúdo entra por baixo). Por isso a lista mora aqui, e
 * não dentro do componente do rail — o roteador em main.tsx precisa dela também.
 */
export const NAV = [
  { to: '/containers', label: 'Containers', icon: Container },
  { to: '/images', label: 'Imagens', icon: Boxes },
  { to: '/volumes', label: 'Volumes', icon: HardDrive },
  { to: '/networks', label: 'Redes', icon: Network },
  { to: '/system', label: 'Sistema', icon: Settings2 }
] as const

/** Mesma regra do item ativo do rail: a view é o prefixo do caminho. */
function navIndex(pathname: string): number {
  return NAV.findIndex(({ to }) => pathname.startsWith(to))
}

/**
 * Tipos de transição para uma navegação, ou `false` para trocar de tela seco.
 *
 * É o que o TanStack Router chama em `defaultViewTransition.types`; devolver
 * `false` faz ele aplicar a navegação sem `startViewTransition` nenhum.
 *
 * Não transiciona quando: é o primeiro load (não existe tela anterior, e `/`
 * redireciona para `/containers` antes de qualquer pintura), quando o caminho
 * não mudou de view (mudança de hash ou de search dentro da mesma tela), e
 * quando a pessoa pediu menos movimento.
 */
export function navTransitionTypes(
  from: { pathname: string } | undefined,
  to: { pathname: string }
): TransitionTypes | false {
  if (!from || prefersReducedMotion()) return false

  const before = navIndex(from.pathname)
  const after = navIndex(to.pathname)
  if (before === -1 || after === -1 || before === after) return false

  return ['nav', after > before ? 'forward' : 'back']
}
