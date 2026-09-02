import { useState } from 'react'
import {
  Button,
  Checkbox,
  Description,
  Input,
  InputGroup,
  Label,
  ListBox,
  NumberField,
  SearchField,
  Select,
  Switch,
  Tag,
  TagGroup,
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
  /**
   * Botão (ou botões) acoplado ao campo: escolher pasta, escolher arquivo.
   *
   * Antes cada tela montava isso com `flex items-end gap-2` e um `IconAction`
   * ao lado: dois controles soltos que por acaso estavam perto, cada um com a
   * sua moldura, e o alinhamento vertical dependia de haver ou não `hint`. O
   * `InputGroup` põe o botão DENTRO da moldura do campo, que é o que ele é —
   * parte do mesmo controle.
   */
  action?: FieldAction | FieldAction[]
}

interface FieldAction {
  label: string
  icon: React.ReactNode
  onPress: () => void
  isDisabled?: boolean
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
  onSubmitKey,
  action
}: TextInputProps): React.JSX.Element {
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (onSubmitKey && e.key === 'Enter') onSubmitKey()
  }
  const acoes = action === undefined ? [] : Array.isArray(action) ? action : [action]

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
      {acoes.length > 0 ? (
        <InputGroup>
          <InputGroup.Input
            autoFocus={autoFocus}
            className={inputClassName}
            placeholder={placeholder}
            onKeyDown={onKeyDown}
          />
          <InputGroup.Suffix>
            {acoes.map((a) => (
              <Tooltip key={a.label} delay={400}>
                <Button
                  isIconOnly
                  aria-label={a.label}
                  isDisabled={a.isDisabled}
                  size="sm"
                  variant="ghost"
                  onPress={a.onPress}
                >
                  {a.icon}
                </Button>
                <Tooltip.Content>{a.label}</Tooltip.Content>
              </Tooltip>
            ))}
          </InputGroup.Suffix>
        </InputGroup>
      ) : (
        <Input
          autoFocus={autoFocus}
          className={inputClassName}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
        />
      )}
      {description && <Description>{description}</Description>}
    </TextField>
  )
}

interface NumberInputProps {
  label: string
  /** `undefined` é campo vazio, e vazio quer dizer "usa o padrão". */
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  hint?: string
  description?: string
  minValue?: number
  maxValue?: number
  /**
   * Passo das setas. NÃO passe isto nos campos em MB.
   *
   * O `NumberField` do React Aria não usa o passo só nas setas: ele ARREDONDA
   * o valor confirmado para o múltiplo mais próximo. Com `step={100}`, digitar
   * 20 grava o mínimo; com `step={512}`, digitar 2048 grava 2049. Um passo
   * confortável para clicar não vale alterar o número que a pessoa escreveu.
   */
  step?: number
  isDisabled?: boolean
  autoFocus?: boolean
  className?: string
}

/**
 * Campo numérico de verdade.
 *
 * Antes cada um destes era um `TextInput` com `Number.parseInt` do lado de
 * fora: quem digitava letra não recebia aviso nenhum (o botão só ficava
 * cinza), não havia mínimo nem passo, e as setas do teclado não faziam nada.
 * O `NumberField` do HeroUI resolve os três de uma vez e ainda dá o
 * `role="spinbutton"` para leitor de tela.
 *
 * Vazio continua sendo um valor válido — é assim que se diz "deixa o padrão".
 * O React Aria representa vazio como `NaN`; a conversão para `undefined` fica
 * aqui, para nenhuma tela precisar saber disso.
 */
export function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  description,
  minValue = 1,
  maxValue,
  step,
  isDisabled,
  autoFocus,
  className
}: NumberInputProps): React.JSX.Element {
  return (
    <NumberField
      className={cn('flex flex-col gap-1.5', className)}
      // Sem separador de milhar: em pt-BR o formatador escreve 2048 MB como
      // "2.048", que num campo técnico lê como dois e pouco. Aqui todo número
      // é contagem crua (núcleos, MB, uid, linhas), nunca valor para humano.
      formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
      isDisabled={isDisabled}
      maxValue={maxValue}
      minValue={minValue}
      step={step}
      value={value ?? Number.NaN}
      onChange={(v) => onChange(Number.isNaN(v) ? undefined : v)}
    >
      <FieldLabel hint={hint} label={label} />
      {/* Ordem da documentação: decremento, campo, incremento. Com o campo
          primeiro, o layout do Group colapsa o input e joga o `+` para a outra
          ponta da linha. */}
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input autoFocus={autoFocus} placeholder={placeholder} />
        <NumberField.IncrementButton />
      </NumberField.Group>
      {description && <Description>{description}</Description>}
    </NumberField>
  )
}

interface TagsInputProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  description?: string
  isDisabled?: boolean
  className?: string
  /**
   * Se a vírgula separa valores na entrada. Ligado por padrão, porque colar
   * uma lista pronta é comum.
   *
   * DESLIGUE onde o próprio valor contém vírgula — `--secret
   * id=npmrc,src=C:\eu\.npmrc` e `--tmpfs /run:rw,size=64m` são UM valor cada.
   * Era exatamente aí que o `split(',')` da versão anterior partia o valor em
   * dois e mandava os dois pedaços para a CLI como flags separadas.
   */
  commaSeparated?: boolean
}

/**
 * Lista de valores, um chip por valor.
 *
 * Estes campos eram texto livre "separe por vírgula", com um `split(',')` na
 * hora de enviar. Três problemas: valor que contém vírgula (um `--label` com
 * texto, uma opção de driver) quebrava calado; não havia como remover um item
 * do meio sem editar a string; e não dava para ver quantos valores existiam.
 * Aqui cada valor é um `Tag` removível, e a vírgula deixa de ser sintaxe.
 *
 * Enter e vírgula confirmam o que está digitado; Backspace no campo vazio
 * apaga o último chip, que é o gesto que todo mundo já espera destes campos.
 */
export function TagsInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
  description,
  isDisabled,
  className,
  commaSeparated = true
}: TagsInputProps): React.JSX.Element {
  const [draft, setDraft] = useState('')

  const commit = (raw: string): void => {
    const novos = (commaSeparated ? raw.split(',') : [raw])
      .map((v) => v.trim())
      .filter((v) => v && !values.includes(v))
    if (novos.length > 0) onChange([...values, ...novos])
    setDraft('')
  }

  // A instrução de uso mora no componente, não em cada tela: assim as 14
  // chamadas falam só do CONTEÚDO do campo, e o gesto é descrito igual em
  // todas — inclusive quando muda.
  const comoUsar = commaSeparated
    ? 'Enter ou vírgula confirma cada valor; Backspace apaga o último.'
    : 'Enter confirma cada valor; Backspace apaga o último.'

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <FieldLabel hint={hint ? `${hint} ${comoUsar}` : comoUsar} label={label} />
      <TextField
        aria-label={label}
        isDisabled={isDisabled}
        value={draft}
        onChange={(v) => (commaSeparated && v.endsWith(',') ? commit(v) : setDraft(v))}
      >
        <Input
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              // Sem isto o Enter envia o formulário do diálogo em volta.
              e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
        />
      </TextField>
      {values.length > 0 && (
        <TagGroup
          aria-label={`Valores de ${label}`}
          size="sm"
          // Sem `onRemove` o HeroUI não desenha o botão de remover — que é
          // exatamente o que "desabilitado" quer dizer aqui.
          onRemove={isDisabled ? undefined : (keys) => onChange(values.filter((v) => !keys.has(v)))}
        >
          <TagGroup.List className="flex flex-wrap gap-1.5 pt-0.5">
            {values.map((v) => (
              <Tag key={v} id={v} textValue={v}>
                {v}
              </Tag>
            ))}
          </TagGroup.List>
        </TagGroup>
      )}
      {description && <Description>{description}</Description>}
    </div>
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
