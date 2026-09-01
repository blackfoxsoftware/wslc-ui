/**
 * Design system do wslc-ui — "Aurora Glass".
 *
 * Ponto de entrada único da UI: features importam daqui, nunca de
 * '@heroui/react' direto. Isso mantém um sistema só no app e deixa qualquer
 * troca futura (ou customização de um primitivo) num lugar só.
 *
 * Camadas: tokens em design/theme.css, material em design/glass.css,
 * composições nos arquivos deste diretório.
 */

// Primitivos do HeroUI usados diretamente pelas features
export {
  Button,
  ButtonGroup,
  Chip,
  Description,
  Header,
  Dropdown,
  Input,
  Kbd,
  Label,
  ListBox,
  Popover,
  ProgressBar,
  ScrollShadow,
  SearchField,
  Select,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TextField,
  ToggleButton,
  Toast,
  ToastProvider,
  Tooltip,
  toast
} from '@heroui/react'

// Composições do design system
export { Group, PageBody, PageHeader, PageShell, SectionTitle } from './layout'
export {
  BareInput,
  CheckboxInput,
  Hint,
  IconAction,
  IconToggle,
  SearchInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput
} from './controls'
export type { SelectOption } from './controls'
export { AppModal, AppSheet, ConfirmOverlay } from './overlays'
export { Cell, Column, DataTable, Metric, Mono, Row, StateChip, StateDot } from './data'
export { Empty, ErrorAlert, Notice } from './feedback'
