import typoUrl from '@/assets/logo/typo.svg'
import { cn } from '@/lib/utils'

/**
 * Marca do produto: só a assinatura tipográfica.
 *
 * O SVG vira data URI no build (assetsInlineLimit no electron.vite.config): o
 * DOM fica limpo e a CSP do renderer, que roda em file://, não bloqueia.
 */

/** Assinatura "WSLC UI" — ciano da marca no "WSLC", branco no "UI". */
export function BrandWordmark({ className }: { className?: string }): React.JSX.Element {
  return <img alt="WSLC UI" className={cn('block w-auto', className)} src={typoUrl} />
}
