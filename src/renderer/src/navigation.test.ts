import { describe, expect, it, vi } from 'vitest'
import { NAV, navTransitionTypes } from './navigation'

/** Atalho: o roteador entrega ParsedLocation, e só o pathname importa aqui. */
const at = (pathname: string) => ({ pathname })

describe('navTransitionTypes', () => {
  it('descer no rail é "forward", subir é "back"', () => {
    expect(navTransitionTypes(at('/containers'), at('/system'))).toEqual(['nav', 'forward'])
    expect(navTransitionTypes(at('/system'), at('/containers'))).toEqual(['nav', 'back'])
    expect(navTransitionTypes(at('/images'), at('/volumes'))).toEqual(['nav', 'forward'])
    expect(navTransitionTypes(at('/volumes'), at('/images'))).toEqual(['nav', 'back'])
  })

  it('o primeiro load não transiciona: não existe tela anterior', () => {
    expect(navTransitionTypes(undefined, at('/containers'))).toBe(false)
  })

  it('mexer no hash ou no search da mesma tela não é troca de tela', () => {
    expect(navTransitionTypes(at('/system'), at('/system'))).toBe(false)
    expect(navTransitionTypes(at('/images'), at('/images/detalhe'))).toBe(false)
  })

  it('caminho que não é view nenhuma (a raiz, antes do redirect) fica de fora', () => {
    expect(navTransitionTypes(at('/'), at('/containers'))).toBe(false)
  })

  it('quem pediu menos movimento troca de tela seco', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(navTransitionTypes(at('/containers'), at('/system'))).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('NAV', () => {
  // A ordem é dado: ela desenha o menu E dá o sentido da transição. Trocar a
  // ordem aqui inverte a direção do movimento, o que é intencional — este teste
  // existe para que a troca seja consciente.
  it('é a ordem das telas no rail', () => {
    expect(NAV.map((n) => n.to)).toEqual(['/containers', '/images', '/volumes', '/networks', '/system'])
  })
})
