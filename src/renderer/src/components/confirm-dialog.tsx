import { ConfirmOverlay } from '@/design'
import { useConfirmStore } from '@/stores/confirm-store'

/** Modal de confirmação global — abra com `confirmDialog(...)` da confirm-store. */
export default function ConfirmDialog(): React.JSX.Element | null {
  const current = useConfirmStore((s) => s.current)
  const settle = useConfirmStore((s) => s.settle)

  if (!current) return null

  return (
    <ConfirmOverlay
      cancelLabel={current.cancelLabel ?? 'Cancelar'}
      confirmLabel={current.confirmLabel ?? 'Confirmar'}
      description={current.description}
      destructive={current.destructive}
      title={current.title}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  )
}
