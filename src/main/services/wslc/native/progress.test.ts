import { describe, expect, it } from 'vitest'
import { mapProgressStatus, ProgressTracker } from './progress'

const msg = (
  id: string | null,
  status: number,
  current = 0,
  total = 0
): { id: string | null; status: number; detail: { currentBytes: number; totalBytes: number } } => ({
  id,
  status,
  detail: { currentBytes: current, totalBytes: total }
})

describe('mapProgressStatus', () => {
  it('mapeia o enum numérico do SDK', () => {
    expect(mapProgressStatus(1)).toBe('pulling')
    expect(mapProgressStatus(3)).toBe('downloading')
    expect(mapProgressStatus(5)).toBe('extracting')
    expect(mapProgressStatus(6)).toBe('complete')
  })

  it('valores fora da faixa viram unknown', () => {
    expect(mapProgressStatus(0)).toBe('unknown')
    expect(mapProgressStatus(99)).toBe('unknown')
    expect(mapProgressStatus(-1)).toBe('unknown')
  })
})

describe('ProgressTracker', () => {
  it('acumula camadas na ordem de chegada', () => {
    const t = new ProgressTracker()
    expect(t.update(msg('aaa', 1))).toBe(true)
    expect(t.update(msg('bbb', 3, 100, 1000))).toBe(true)
    expect(t.update(msg('aaa', 3, 50, 200))).toBe(true)
    expect(t.snapshot()).toEqual([
      { id: 'aaa', status: 'downloading', current: 50, total: 200 },
      { id: 'bbb', status: 'downloading', current: 100, total: 1000 }
    ])
  })

  it('complete zera os bytes no SDK — mantém o total anterior para a barra encher', () => {
    const t = new ProgressTracker()
    t.update(msg('aaa', 3, 900, 1000))
    t.update(msg('aaa', 6, 0, 0))
    expect(t.snapshot()).toEqual([{ id: 'aaa', status: 'complete', current: 1000, total: 1000 }])
  })

  it('complete direto (camada em cache) fica com bytes zerados', () => {
    const t = new ProgressTracker()
    t.update(msg('aaa', 6, 0, 0))
    expect(t.snapshot()).toEqual([{ id: 'aaa', status: 'complete', current: 0, total: 0 }])
  })

  it('mensagem final de id vazio (ou nulo) não vira camada', () => {
    const t = new ProgressTracker()
    expect(t.update(msg('', 6))).toBe(false)
    expect(t.update(msg(null, 6))).toBe(false)
    expect(t.snapshot()).toEqual([])
  })

  it('ids em skipIds (a tag da 1ª mensagem do pull) não viram camada', () => {
    const t = new ProgressTracker(['latest'])
    expect(t.update(msg('latest', 1))).toBe(false)
    expect(t.update(msg('aaa', 1))).toBe(true)
    expect(t.snapshot().map((l) => l.id)).toEqual(['aaa'])
  })
})

describe('ProgressTracker em modo push (status vem sempre 0 do SDK)', () => {
  it('deriva waiting → uploading → complete pelos bytes', () => {
    const t = new ProgressTracker([], 'push')
    t.update(msg('aaa', 0, 0, 0))
    expect(t.snapshot()).toEqual([{ id: 'aaa', status: 'waiting', current: 0, total: 0 }])
    t.update(msg('aaa', 0, 500, 1000))
    expect(t.snapshot()).toEqual([{ id: 'aaa', status: 'uploading', current: 500, total: 1000 }])
    // O SDK zera os contadores no fim da camada — vira complete com a barra cheia.
    t.update(msg('aaa', 0, 0, 0))
    expect(t.snapshot()).toEqual([{ id: 'aaa', status: 'complete', current: 1000, total: 1000 }])
  })

  it('mensagens de id vazio (1ª e última do push) não viram camada', () => {
    const t = new ProgressTracker([], 'push')
    expect(t.update(msg('', 0))).toBe(false)
    expect(t.snapshot()).toEqual([])
  })

  it('current acima do total é aceito (o SDK envia mais bytes que o tamanho da camada)', () => {
    const t = new ProgressTracker([], 'push')
    t.update(msg('aaa', 0, 8697856, 8415579))
    expect(t.snapshot()[0]).toMatchObject({ status: 'uploading', current: 8697856, total: 8415579 })
  })

  it('modo pull continua mapeando o enum do SDK sem derivação', () => {
    const t = new ProgressTracker([], 'pull')
    t.update(msg('aaa', 0, 0, 0))
    expect(t.snapshot()[0]?.status).toBe('unknown')
  })
})
