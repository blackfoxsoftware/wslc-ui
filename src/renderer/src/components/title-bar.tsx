import { useEffect } from 'react'
import { Copy, Minus, PanelLeft, Square, X } from 'lucide-react'
import { BrandWordmark } from '@/components/brand'
import { Chip, IconAction } from '@/design'
import { useUiStore } from '@/stores/ui-store'
import { initWindowSubscriptions, useWindowStore } from '@/stores/window-store'

interface Props {
  /** Mostra o botão de recolher o rail (layout principal). */
  withRailToggle?: boolean
}

/**
 * Barra de título da janela frameless: é a moldura do app, não uma superfície
 * de conteúdo. A faixa com `-webkit-app-region: drag` recebe o comportamento
 * nativo de caption.
 */
export default function TitleBar({ withRailToggle = false }: Props): React.JSX.Element {
  const maximized = useWindowStore((s) => s.maximized)
  const railCollapsed = useUiStore((s) => s.railCollapsed)
  const minimize = useWindowStore((s) => s.minimize)
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize)
  const close = useWindowStore((s) => s.close)
  const toggleRail = useUiStore((s) => s.toggleRail)

  useEffect(() => {
    void useWindowStore.getState().refresh()
    return initWindowSubscriptions()
  }, [])

  return (
    <header className="flex h-10 shrink-0 select-none items-center gap-2 border-b border-border pl-2.5 [-webkit-app-region:drag]">
      {withRailToggle && (
        <div className="[-webkit-app-region:no-drag]">
          <IconAction label={railCollapsed ? 'Expandir menu' : 'Recolher menu'} onPress={toggleRail}>
            <PanelLeft className="size-4" />
          </IconAction>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <BrandWordmark className="h-3" />
        <Chip color="default" size="sm" variant="soft">
          <Chip.Label>preview</Chip.Label>
        </Chip>
      </div>

      <div className="h-full flex-1" />

      <div className="flex h-full [-webkit-app-region:no-drag]">
        <button
          aria-label="Minimizar"
          className="flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-default hover:text-foreground"
          onClick={() => void minimize()}
        >
          <Minus className="size-4" />
        </button>
        <button
          aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          className="flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-default hover:text-foreground"
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
        </button>
        <button
          aria-label="Fechar"
          className="flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-danger hover:text-danger-foreground"
          onClick={() => void close()}
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  )
}
