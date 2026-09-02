import { flushSync } from 'react-dom'

/**
 * View transitions do app.
 *
 * Trocar de tela e trocar de aba são o mesmo problema: uma região da tela troca
 * de conteúdo, e o antigo precisa sair enquanto o novo entra — sem snapshot não
 * há como animar a saída de algo que o React já desmontou. A coreografia mora em
 * design/motion.css; aqui só existe o disparo.
 *
 * Mora em lib/ e não em design/ porque quem chama não é só componente: o
 * roteador em main.tsx precisa da mesma primitiva, e lib/ é o que os dois podem
 * importar sem inverter camada.
 *
 * Duas regras valem para todo uso:
 *
 *  1. `types` é obrigatório. O HeroUI já usa view transition na fila de toasts
 *     (toast.css), SEM tipo nenhum, e toda a nossa coreografia está escrita
 *     dentro de `:active-view-transition-type(...)` justamente para não pegar os
 *     toasts dele. Uma transição nossa sem tipo captura a tela e não anima nada.
 *
 *  2. O `update` roda dentro de `flushSync`. O React agenda o commit para
 *     depois; o Chrome captura o estado novo assim que a promessa do update
 *     resolve. Sem o flush ele captura o estado ANTIGO duas vezes, e a
 *     transição passa em branco.
 */

/**
 * O gesto que está acontecendo. Vira o seletor de tipo no CSS.
 *
 * Só dois, e a razão está em design/motion.css: view transition é para região
 * que troca de CONTEÚDO. Mudança de layout (o rail recolhendo, um painel
 * crescendo) é transição de CSS no elemento de verdade — snapshot ali dobra o
 * texto reflowado.
 */
export type TransitionKind = 'nav' | 'tab'

/** Para onde o estado andou, na ordem do navegador (rail ou faixa de abas). */
export type TransitionDirection = 'forward' | 'back'

export type TransitionTypes = [TransitionKind] | [TransitionKind, TransitionDirection]

/**
 * Quem pediu para o sistema parar de animar.
 *
 * Checado na hora do gesto, e não uma vez no boot: é uma preferência que a
 * pessoa pode ligar com o app aberto.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Aplica `update` dentro de uma view transition — ou direto, sem transição.
 *
 * Cai no caminho direto quando não há o que animar (`types` vazio), quando a
 * pessoa pediu menos movimento, e quando a API não existe: é o caso do
 * happy-dom nos testes de unidade, onde a troca precisa acontecer igual.
 */
export function startViewTransition(update: () => void, types: TransitionTypes | []): void {
  if (types.length === 0 || prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
    update()
    return
  }

  const transition = document.startViewTransition({ update: () => flushSync(update), types: [...types] })

  // Começar uma transição em cima de outra (dois cliques rápidos) aborta a
  // primeira, e abortada significa promessa rejeitada. Sem estes catch o
  // renderer loga "Unhandled promise rejection" a cada clique apressado.
  transition.ready.catch(() => {})
  transition.finished.catch(() => {})
}

/**
 * Nome de região único por instância, a partir de um `useId()`.
 *
 * `view-transition-name` repetido em dois elementos vivos faz o Chrome
 * DESCARTAR a transição inteira, sem erro na tela e sem erro no console. O caso
 * real é o painel de aba: um diálogo com abas (run, build) abre em cima de uma
 * view com abas (Imagens), e os dois painéis coexistem. O id do React resolve a
 * unicidade; a limpeza é porque o que ele produz (`«r0»`, `_r_0_`) não é um
 * custom-ident válido em CSS.
 */
export function viewTransitionName(id: string): string {
  return `vt-${id.replaceAll(/[^\w-]/g, '')}`
}
