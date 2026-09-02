import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tabs } from './tabs'

/**
 * O wrapper de abas: seleção, sentido da troca e nome de região por instância.
 */

function Trio({ id }: { id?: string }): React.JSX.Element {
  return (
    <Tabs defaultSelectedKey="um" variant="secondary">
      <Tabs.ListContainer>
        <Tabs.List aria-label={id ?? 'Abas'}>
          <Tabs.Tab id="um">
            Um
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="dois">
            Dois
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="tres">
            Três
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="um">conteúdo um</Tabs.Panel>
      <Tabs.Panel id="dois">conteúdo dois</Tabs.Panel>
      <Tabs.Panel id="tres">conteúdo três</Tabs.Panel>
    </Tabs>
  )
}

/** API falsa que registra os tipos e aplica a troca na hora. */
function spyOnTransitions(): { types: string[][] } {
  const types: string[][] = []
  // @ts-expect-error -- o happy-dom não tem a API; aqui ela é plantada
  document.startViewTransition = (arg: { update: () => void; types?: string[] | null }) => {
    types.push([...(arg.types ?? [])])
    arg.update()
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {}
    }
  }
  return { types }
}

const panelOf = (text: string): HTMLElement => screen.getByText(text).closest('[role="tabpanel"]')!

afterEach(() => {
  // @ts-expect-error -- desfaz o que o spy plantou
  delete document.startViewTransition
})

describe('Tabs', () => {
  it('troca de painel pelo clique, como o HeroUI cru', async () => {
    const user = userEvent.setup()
    render(<Trio />)

    expect(screen.getByText('conteúdo um')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Dois' }))

    expect(screen.getByText('conteúdo dois')).not.toBeNull()
    // O React Aria só monta o painel selecionado.
    expect(screen.queryByText('conteúdo um')).toBeNull()
  })

  it('o sentido sai da posição na faixa: para a direita é forward, para trás é back', async () => {
    const { types } = spyOnTransitions()
    const user = userEvent.setup()
    render(<Trio />)

    await user.click(screen.getByRole('tab', { name: 'Três' }))
    expect(types.at(-1)).toEqual(['tab', 'forward'])

    await user.click(screen.getByRole('tab', { name: 'Dois' }))
    expect(types.at(-1)).toEqual(['tab', 'back'])
  })

  it('clicar na aba que já está aberta não transiciona nada', async () => {
    const { types } = spyOnTransitions()
    const user = userEvent.setup()
    render(<Trio />)

    await user.click(screen.getByRole('tab', { name: 'Um' }))
    expect(types).toHaveLength(0)
  })

  it('sem a API do navegador, a troca acontece igual', async () => {
    const user = userEvent.setup()
    render(<Trio />)

    await user.click(screen.getByRole('tab', { name: 'Três' }))
    expect(screen.getByText('conteúdo três')).not.toBeNull()
  })

  it('o painel carrega um nome de região', () => {
    render(<Trio />)
    expect(panelOf('conteúdo um').style.viewTransitionName).toMatch(/^vt-/)
  })

  // A regressão que importa: um diálogo com abas abre em cima de uma view com
  // abas. Dois painéis com o MESMO nome fariam o Chrome descartar a transição
  // inteira, em silêncio — nenhuma das duas animaria.
  it('duas instâncias na tela recebem nomes diferentes', () => {
    render(
      <>
        <Trio id="de-baixo" />
        <Trio id="de-cima" />
      </>
    )

    const nomes = screen.getAllByRole('tabpanel').map((p) => p.style.viewTransitionName)
    expect(nomes).toHaveLength(2)
    expect(nomes[0]).not.toBe(nomes[1])
    expect(nomes.every((n) => n.startsWith('vt-'))).toBe(true)
  })

  it('respeita quem controla a seleção de fora', async () => {
    const onSelectionChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Tabs selectedKey="um" variant="secondary" onSelectionChange={onSelectionChange}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Abas">
            <Tabs.Tab id="um">
              Um
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="dois">
              Dois
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="um">conteúdo um</Tabs.Panel>
        <Tabs.Panel id="dois">conteúdo dois</Tabs.Panel>
      </Tabs>
    )

    await user.click(screen.getByRole('tab', { name: 'Dois' }))

    expect(onSelectionChange).toHaveBeenCalledWith('dois')
    // Quem manda é o pai: sem ele mudar o selectedKey, o painel não muda.
    expect(screen.getByText('conteúdo um')).not.toBeNull()
  })
})
