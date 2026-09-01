import {
  Button,
  Checkbox,
  Description,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Switch,
  TextArea,
  TextField,
  ToggleButton,
  Tooltip
} from '@heroui/react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Controles do design system. Todos embrulham o HeroUI para que uma view
 * escreva um campo em uma linha e o rótulo/descrição/erro venham sempre no
 * mesmo lugar (rótulo ACIMA, ajuda abaixo — nunca placeholder como rótulo).
 *
 * Explicação de campo vai em `hint`: o rótulo fica curto e o detalhe (a flag
 * equivalente da CLI, o formato aceito, o efeito colateral) aparece num
 * tooltip. Texto entre parênteses no rótulo polui a tela e some no meio do
 * formulário. `description`, que imprime abaixo do campo, fica para o que o
 * usuário precisa ler antes de digitar.
 */

interface IconActionProps {
  label: string
  children: React.ReactNode
  onPress: () => void
  isDisabled?: boolean
  variant?: 'primary' | 'ghost' | 'secondary' | 'outline' | 'danger-soft'
  size?: 'sm' | 'md'
  className?: string
}

/** Botão só-ícone com tooltip obrigatório (o rótulo vira o nome acessível). */
export function IconAction({
  label,
  children,
  onPress,
  isDisabled,
  variant = 'ghost',
  size = 'sm',
  className
}: IconActionProps): React.JSX.Element {
  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        aria-label={label}
        className={className}
        isDisabled={isDisabled}
        size={size}
        variant={variant}
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
}

interface IconToggleProps {
  label: string
  children: React.ReactNode
  isSelected: boolean
  onChange: (value: boolean) => void
  isDisabled?: boolean
  size?: 'sm' | 'md'
}

/**
 * Chave liga/desliga só-ícone, com tooltip obrigatório. Diferente do
 * `IconAction`: aqui o botão guarda estado, e o estado ligado aparece no fundo
 * de acento do próprio botão — por isso o rótulo diz o que a chave mostra
 * ("Mostrar parados"), não o que o clique vai fazer.
 */
export function IconToggle({
  label,
  children,
  isSelected,
  onChange,
  isDisabled,
  size = 'sm'
}: IconToggleProps): React.JSX.Element {
  return (
    <Tooltip delay={400}>
      <ToggleButton
        isIconOnly
        aria-label={label}
        isDisabled={isDisabled}
        isSelected={isSelected}
        size={size}
        onChange={onChange}
      >
        {children}
      </ToggleButton>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
}

/** Ícone de ajuda: explicação de um campo sem ocupar linha na tela. */
export function Hint({ text, className }: { text: string; className?: string }): React.JSX.Element {
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger
        aria-label={text}
        className={cn(
          'inline-flex shrink-0 rounded-full text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none',
          className
        )}
      >
        <Info className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-[38ch]">{text}</Tooltip.Content>
    </Tooltip>
  )
}

/** Rótulo do campo com a dica opcional ao lado. */
function FieldLabel({ label, hint }: { label: string; hint?: string }): React.JSX.Element {
  if (!hint) return <Label>{label}</Label>
  return (
    <span className="flex items-center gap-1.5">
      <Label>{label}</Label>
      <Hint text={hint} />
    </span>
  )
}

interface BareInputProps {
  /** Nome acessível: o campo não tem rótulo visível (linhas de par, filtros). */
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isDisabled?: boolean
  className?: string
  onSubmitKey?: () => void
}

/** Campo sem rótulo visível, para linhas repetidas (porta→porta, chave=valor). */
export function BareInput({
  ariaLabel,
  value,
  onChange,
  placeholder,
  isDisabled,
  className,
  onSubmitKey
}: BareInputProps): React.JSX.Element {
  return (
    <TextField
      aria-label={ariaLabel}
      className={cn('min-w-0 flex-1', className)}
      isDisabled={isDisabled}
      value={value}
      onChange={onChange}
    >
      <Input
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (onSubmitKey && e.key === 'Enter') onSubmitKey()
        }}
      />
    </TextField>
  )
}

interface SearchInputProps {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** Busca da barra de filtros: cresce até o fim da faixa e limpa com um clique. */
export function SearchInput({
  ariaLabel,
  value,
  onChange,
  placeholder,
  className
}: SearchInputProps): React.JSX.Element {
  return (
    <SearchField
      aria-label={ariaLabel}
      className={cn('min-w-0 flex-1', className)}
      value={value}
      onChange={onChange}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )
}

interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Explicação em tooltip ao lado do rótulo. */
  hint?: string
  description?: string
  type?: 'text' | 'password' | 'number'
  isDisabled?: boolean
  isRequired?: boolean
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  onSubmitKey?: () => void
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  description,
  type = 'text',
  isDisabled,
  isRequired,
  autoFocus,
  className,
  inputClassName,
  onSubmitKey
}: TextInputProps): React.JSX.Element {
  return (
    <TextField
      className={cn('flex flex-col gap-1.5', className)}
      isDisabled={isDisabled}
      isRequired={isRequired}
      type={type}
      value={value}
      onChange={onChange}
    >
      <FieldLabel hint={hint} label={label} />
      <Input
        autoFocus={autoFocus}
        className={inputClassName}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (onSubmitKey && e.key === 'Enter') onSubmitKey()
        }}
      />
      {description && <Description>{description}</Description>}
    </TextField>
  )
}

interface TextAreaInputProps extends Omit<TextInputProps, 'type' | 'onSubmitKey'> {
  rows?: number
}

export function TextAreaInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  description,
  isDisabled,
  className,
  inputClassName,
  rows = 4
}: TextAreaInputProps): React.JSX.Element {
  return (
    <TextField
      className={cn('flex flex-col gap-1.5', className)}
      isDisabled={isDisabled}
      value={value}
      onChange={onChange}
    >
      <FieldLabel hint={hint} label={label} />
      <TextArea className={inputClassName} placeholder={placeholder} rows={rows} />
      {description && <Description>{description}</Description>}
    </TextField>
  )
}

export interface SelectOption {
  id: string
  label: string
  description?: string
}

interface SelectInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  hint?: string
  description?: string
  placeholder?: string
  isDisabled?: boolean
  className?: string
  /** Barra de filtros: o rótulo vira só nome acessível, o valor já se explica. */
  hideLabel?: boolean
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  hint,
  description,
  placeholder,
  isDisabled,
  className,
  hideLabel
}: SelectInputProps): React.JSX.Element {
  return (
    <Select
      aria-label={hideLabel ? label : undefined}
      className={cn('flex flex-col gap-1.5', className)}
      isDisabled={isDisabled}
      placeholder={placeholder}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
    >
      {!hideLabel && <FieldLabel hint={hint} label={label} />}
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description && <Description>{description}</Description>}
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              <div className="flex flex-col">
                <span>{o.label}</span>
                {o.description && <span className="text-xs text-muted">{o.description}</span>}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

interface ToggleProps {
  label: string
  isSelected: boolean
  onChange: (value: boolean) => void
  hint?: string
  description?: string
  isDisabled?: boolean
  className?: string
}

export function SwitchInput({
  label,
  isSelected,
  onChange,
  hint,
  description,
  isDisabled,
  className
}: ToggleProps): React.JSX.Element {
  const control = (
    <Switch
      className={hint ? undefined : className}
      isDisabled={isDisabled}
      isSelected={isSelected}
      onChange={onChange}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label>{label}</Label>
      </Switch.Content>
      {description && <Description>{description}</Description>}
    </Switch>
  )

  // A dica fica FORA do <label> do switch: dentro dele, clicar no ícone
  // alternaria o controle.
  if (!hint) return control
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {control}
      <Hint text={hint} />
    </div>
  )
}

export function CheckboxInput({
  label,
  isSelected,
  onChange,
  hint,
  description,
  isDisabled,
  className
}: ToggleProps): React.JSX.Element {
  const control = (
    <Checkbox
      className={hint ? undefined : className}
      isDisabled={isDisabled}
      isSelected={isSelected}
      onChange={onChange}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{label}</Label>
      </Checkbox.Content>
      {description && <Description>{description}</Description>}
    </Checkbox>
  )

  if (!hint) return control
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {control}
      <Hint text={hint} />
    </div>
  )
}
