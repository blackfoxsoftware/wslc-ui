import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, startViewTransition, viewTransitionName } from './view-transition'

/**
 * A primitiva de transição.
 *
 * O happy-dom não implementa `document.startViewTransition`, o que é uma sorte:
 * o caminho de fallback (aplicar a troca direto) é exatamente o que os outros
 * 90 testes de renderer exercitam sem saber, e é o que tem que continuar
 * funcionando. Aqui a API é plantada à mão para ver o outro caminho.
 */

interface FakeTransition {
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: () => void
}

/** Instala uma API falsa e devolve o que ela recebeu. */
function fakeApi(options?: { rejects?: boolean }) {
  const calls: { types: string[] }[] = []

  const start = vi.fn((arg: { update: () => void; types?: string[] | null }): FakeTransition => {
    calls.push({ types: [...(arg.types ?? [])] })
    arg.update()
    const settled = options?.rejects ? Promise.reject(new Error('abortada')) : Promise.resolve()
    return {
      ready: settled,
      finished: settled,
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {}
    }
  })

  // @ts-expect-error -- plantando uma API que o happy-dom não tem
  document.startViewTransition = start
  return { start, calls }
}

afterEach(() => {
  // @ts-expect-error -- desfaz o que o fakeApi plantou
  delete document.startViewTransition
  vi.restoreAllMocks()
})

describe('startViewTransition', () => {
  it('sem a API do navegador, aplica a troca direto', () => {
    const update = vi.fn()
    startViewTransition(update, ['nav', 'forward'])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('com a API, a troca acontece uma vez e os tipos chegam junto', () => {
    const { start, calls } = fakeApi()
    const update = vi.fn()

    startViewTransition(update, ['tab', 'back'])

    expect(start).toHaveBeenCalledTimes(1)
    expect(calls[0]?.types).toEqual(['tab', 'back'])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('sem tipo não transiciona: toda a coreografia é escrita por tipo', () => {
    const { start } = fakeApi()
    const update = vi.fn()

    startViewTransition(update, [])

    expect(start).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('quem pediu menos movimento recebe a troca seca', () => {
    const { start } = fakeApi()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const update = vi.fn()

    startViewTransition(update, ['nav', 'forward'])

    expect(start).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  // Transição abortada (dois cliques em cima um do outro) rejeita `ready` e
  // `finished`. Se este teste passar sem "unhandled rejection", os catch estão
  // no lugar — é justamente isso que ele mede.
  it('não deixa vazar a rejeição de uma transição abortada', async () => {
    fakeApi({ rejects: true })
    startViewTransition(() => {}, ['nav', 'back'])
    await Promise.resolve()
  })
})

describe('prefersReducedMotion', () => {
  it('é lido no gesto, não no boot: a preferência muda com o app aberto', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia')

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList)
    expect(prefersReducedMotion()).toBe(false)

    matchMedia.mockReturnValue({ matches: true } as MediaQueryList)
    expect(prefersReducedMotion()).toBe(true)
  })
})

describe('viewTransitionName', () => {
  it('vira um custom-ident válido, com prefixo (o id do React pode começar com dígito)', () => {
    expect(viewTransitionName('«r0»')).toBe('vt-r0')
    expect(viewTransitionName('_r_1_')).toBe('vt-_r_1_')
    expect(viewTransitionName(':r7:')).toBe('vt-r7')
  })

  it('ids diferentes dão nomes diferentes — é o que evita a colisão', () => {
    expect(viewTransitionName('«r0»')).not.toBe(viewTransitionName('«r1»'))
  })
})
