import { describe, expect, it } from 'vitest'
import { createStartupFilter } from './terminal-noise'

const NOISE = "sh: can't access tty; job control turned off\n"

describe('createStartupFilter', () => {
  it('remove o aviso de job control e deixa o prompt passar', () => {
    const f = createStartupFilter()
    expect(f.push(`${NOISE}/ # `)).toBe('/ # ')
  })

  it('remove o aviso mesmo partido em dois chunks', () => {
    const f = createStartupFilter()
    // O SDK entrega por callback: a mensagem pode chegar em pedaços.
    expect(f.push("sh: can't access tty;")).toBe('')
    expect(f.push(' job control turned off\n/ # ')).toBe('/ # ')
  })

  it('não segura o prompt esperando virar ruído', () => {
    const f = createStartupFilter()
    // Sem \n no fim e sem cara de nome de shell: sai na hora.
    expect(f.push('/ # ')).toBe('/ # ')
  })

  it('cobre as variações de bash e busybox', () => {
    expect(createStartupFilter().push('bash: no job control in this shell\nok\n')).toBe('ok\n')
    expect(
      createStartupFilter().push(
        'bash: cannot set terminal process group (-1): Inappropriate ioctl for device\nok\n'
      )
    ).toBe('ok\n')
  })

  it('remove mais de um aviso seguido', () => {
    const f = createStartupFilter()
    expect(f.push(`${NOISE}bash: no job control in this shell\n/ # `)).toBe('/ # ')
  })

  it('depois do stop não filtra mais nada', () => {
    const f = createStartupFilter()
    f.stop()
    // Saída legítima de um comando do usuário nunca é tocada.
    expect(f.push(NOISE)).toBe(NOISE)
  })

  it('stop devolve o que estava retido', () => {
    const f = createStartupFilter()
    expect(f.push('bas')).toBe('')
    expect(f.stop()).toBe('bas')
  })

  it('deixa passar saída comum', () => {
    const f = createStartupFilter()
    expect(f.push('total 0\ndrwxr-xr-x 2 root root\n')).toBe('total 0\ndrwxr-xr-x 2 root root\n')
  })
})
