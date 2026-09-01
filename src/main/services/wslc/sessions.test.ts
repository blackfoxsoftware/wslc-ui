import { describe, expect, it } from 'vitest'
import { parseSessionTable } from './sessions'

describe('parseSessionTable', () => {
  it('parseia a tabela localizada do session list (pt-BR)', () => {
    const out = [
      'Identificação   PID do Criador   Nome de Exibição',
      '29              8880             wslc-cli-rafaelsell',
      '141             24300            WslcUi'
    ].join('\r\n')
    expect(parseSessionTable(out)).toEqual([
      { id: '29', creatorPid: '8880', displayName: 'wslc-cli-rafaelsell' },
      { id: '141', creatorPid: '24300', displayName: 'WslcUi' }
    ])
  })

  it('ignora o cabeçalho (qualquer locale) e linhas [wslc] do --verbose', () => {
    const out = [
      '[wslc] Found 1 sessions',
      'Id   Creator PID   Display Name',
      '7    123           Sessão Com Espaços  '
    ].join('\n')
    expect(parseSessionTable(out)).toEqual([
      { id: '7', creatorPid: '123', displayName: 'Sessão Com Espaços' }
    ])
  })

  it('saída vazia devolve lista vazia', () => {
    expect(parseSessionTable('')).toEqual([])
    expect(parseSessionTable('Identificação   PID do Criador   Nome de Exibição\n')).toEqual([])
  })
})
