import { Alert, EmptyState } from '@heroui/react'
import { cn } from '@/lib/utils'

interface ErrorAlertProps {
  children: React.ReactNode
  title?: string
  className?: string
}

/** Erro de operação, sempre inline e perto do que falhou. */
export function ErrorAlert({ children, title, className }: ErrorAlertProps): React.JSX.Element {
  return (
    <Alert className={cn('items-start', className)} status="danger">
      <Alert.Indicator />
      <Alert.Content>
        {title && <Alert.Title>{title}</Alert.Title>}
        <Alert.Description className="break-words">{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}

interface NoticeProps {
  children: React.ReactNode
  title?: string
  status?: 'default' | 'accent' | 'warning' | 'success'
  className?: string
}

/** Aviso contextual (limitação do motor, comportamento da CLI). */
export function Notice({ children, title, status = 'accent', className }: NoticeProps): React.JSX.Element {
  return (
    <Alert className={cn('items-start', className)} status={status}>
      <Alert.Indicator />
      <Alert.Content>
        {title && <Alert.Title>{title}</Alert.Title>}
        <Alert.Description className="leading-relaxed">{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}

interface EmptyProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/** Estado vazio composto: o que é, por que está vazio, como preencher. */
export function Empty({ icon, title, description, action, className }: EmptyProps): React.JSX.Element {
  return (
    <EmptyState className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-default text-muted [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold">{title}</p>
        {description && <p className="max-w-[46ch] text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </EmptyState>
  )
}
