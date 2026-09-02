import { Children, createContext, isValidElement, useContext, useId, useState } from 'react'
import type { ComponentProps } from 'react'
import { Tabs as HeroTabs } from '@heroui/react'
import { startViewTransition, viewTransitionName, type TransitionTypes } from '@/lib/view-transition'

/**
 * Abas do design system: o `Tabs` do HeroUI com transição entre painéis.
 *
 * As quatro telas que usam abas não mudam uma linha — o wrapper tem a mesma
 * forma (função com estáticos) e a mesma API. O que ele acrescenta:
 *
 *  1. Assume o controle da seleção, para poder interceptar a troca. Quem chama
 *     continua passando `defaultSelectedKey`; se passar `selectedKey` de fora, o
 *     wrapper respeita e só embrulha.
 *
 *  2. Descobre o SENTIDO da troca. A ordem das abas sai de uma varredura dos
 *     próprios children, e não do DOM: o react-aria-components não escreve a
 *     key em atributo nenhum (não existe `data-key`), então o DOM não sabe
 *     dizer qual aba é qual.
 *
 *  3. Nomeia o painel com um nome ÚNICO por instância. Isso é o que evita a
 *     armadilha séria: `view-transition-name` repetido descarta a transição
 *     inteira em silêncio, e um diálogo com abas (run, build) abre justamente em
 *     cima de uma view com abas (Imagens). A animação é endereçada pela classe
 *     `tab-panel` em design/motion.css, não pelo nome.
 */

type TabsProps = ComponentProps<typeof HeroTabs>
type PanelProps = ComponentProps<typeof HeroTabs.Panel>
type TabKey = NonNullable<TabsProps['selectedKey']>

/** Nome da região do painel, do <Tabs> para o <Tabs.Panel> dele. */
const PanelName = createContext<string | undefined>(undefined)

/** Ordem das abas, na ordem em que aparecem na faixa. */
function collectTabKeys(children: React.ReactNode, into: TabKey[] = []): TabKey[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return

    if (child.type === HeroTabs.Tab) {
      const { id } = child.props as { id?: TabKey }
      if (id !== undefined) into.push(id)
      return
    }

    const { children: nested } = child.props as { children?: React.ReactNode }
    if (nested !== undefined) collectTabKeys(nested, into)
  })
  return into
}

/** Para que lado a faixa andou, ou nada se não há como saber. */
function tabTransitionTypes(order: TabKey[], from: TabKey | undefined, to: TabKey): TransitionTypes | [] {
  if (from === undefined) return []

  const before = order.indexOf(from)
  const after = order.indexOf(to)
  if (before === -1 || after === -1 || before === after) return []

  return ['tab', after > before ? 'forward' : 'back']
}

function TabsRoot({
  children,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  ...props
}: TabsProps): React.JSX.Element {
  const name = viewTransitionName(useId())
  const order = collectTabKeys(children)

  // Controlado desde o primeiro render, mesmo quem chama sem nada: virar de
  // não-controlado para controlado no primeiro clique é o que o React Aria
  // reclama em console.
  const [internal, setInternal] = useState<TabKey | undefined>(() => defaultSelectedKey ?? order[0])
  const current = selectedKey ?? internal

  const select = (key: TabKey): void => {
    startViewTransition(
      () => {
        if (selectedKey === undefined) setInternal(key)
        onSelectionChange?.(key)
      },
      tabTransitionTypes(order, current, key)
    )
  }

  return (
    <PanelName.Provider value={name}>
      <HeroTabs {...props} selectedKey={current} onSelectionChange={select}>
        {children}
      </HeroTabs>
    </PanelName.Provider>
  )
}

function TabPanel({ style, ...props }: PanelProps): React.JSX.Element {
  const name = useContext(PanelName)

  // `style` do React Aria também aceita função (render props). Nenhuma tela usa
  // hoje, mas a forma composta é a que não perde o nome se alguém usar.
  const withName: PanelProps['style'] =
    typeof style === 'function'
      ? (values) => ({ ...style(values), viewTransitionName: name })
      : { ...style, viewTransitionName: name }

  return <HeroTabs.Panel {...props} style={withName} />
}

/**
 * `Root` não é reexportado de propósito: é a raiz crua do HeroUI, sem transição
 * e sem o nome do painel, então usá-la seria desligar tudo isso sem querer.
 */
export const Tabs = Object.assign(TabsRoot, {
  ListContainer: HeroTabs.ListContainer,
  List: HeroTabs.List,
  Tab: HeroTabs.Tab,
  Indicator: HeroTabs.Indicator,
  Panel: TabPanel
})
