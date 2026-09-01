import { AlertDialog, Button, Drawer, Modal } from '@heroui/react'
import { cn } from '@/lib/utils'

/**
 * Overlays do design system. Encapsulam a composição do HeroUI
 * (Backdrop → Container → Dialog) para que uma feature só declare
 * título, corpo e rodapé.
 *
 * Todos montam já abertos: o padrão do app é renderizar o overlay
 * condicionalmente ({open && <AppModal .../>}).
 */

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

/** Larguras próprias: as do HeroUI param em 32rem, curto para formulários. */
const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl'
}

interface AppModalProps {
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  size?: ModalSize
  /** Clique fora / Esc fecham. Desligue em operações longas. */
  isDismissable?: boolean
  className?: string
  bodyClassName?: string
}

export function AppModal({
  title,
  description,
  children,
  onClose,
  footer,
  size = 'md',
  isDismissable = true,
  className,
  bodyClassName
}: AppModalProps): React.JSX.Element {
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Modal.Backdrop isDismissable={isDismissable} variant="blur">
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className={cn('gap-5', MODAL_WIDTH[size], className)}>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-display tracking-tight">{title}</Modal.Heading>
              {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
            </Modal.Header>
            <Modal.Body className={cn('flex min-w-0 flex-col gap-4 overflow-x-hidden', bodyClassName)}>
              {children}
            </Modal.Body>
            {footer && <Modal.Footer>{footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

interface AppSheetProps {
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  /** Largura do painel lateral. */
  width?: string
  bodyClassName?: string
}

/** Painel lateral para detalhes, terminal e inspeções longas. */
export function AppSheet({
  title,
  description,
  children,
  onClose,
  footer,
  width = 'w-[min(46rem,92vw)]',
  bodyClassName
}: AppSheetProps): React.JSX.Element {
  return (
    <Drawer
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Drawer.Backdrop variant="blur">
        <Drawer.Content placement="right">
          <Drawer.Dialog className={cn('h-full gap-4', width)}>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading className="font-display tracking-tight">{title}</Drawer.Heading>
              {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
            </Drawer.Header>
            <Drawer.Body className={cn('min-h-0 flex-1', bodyClassName)}>{children}</Drawer.Body>
            {footer && <Drawer.Footer>{footer}</Drawer.Footer>}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}

interface ConfirmProps {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmação bloqueante (destrutiva ou não). Usada pelo confirm-store. */
export function ConfirmOverlay({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive,
  onConfirm,
  onCancel
}: ConfirmProps): React.JSX.Element {
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialog.Backdrop variant="blur">
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="gap-4">
            <AlertDialog.Header>
              <AlertDialog.Heading className="font-display tracking-tight">{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            {description && (
              <AlertDialog.Body className="text-sm leading-relaxed text-muted">
                {description}
              </AlertDialog.Body>
            )}
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant={destructive ? 'danger' : 'primary'} onPress={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
