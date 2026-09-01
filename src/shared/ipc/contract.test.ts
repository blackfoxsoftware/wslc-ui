import { describe, expect, it } from 'vitest'
import { eventChannels, eventContract, invokeChannels, invokeContract } from './contract'

describe('contrato IPC', () => {
  it('todo canal invoke declara schemas de entrada e saída', () => {
    for (const channel of invokeChannels) {
      const def = invokeContract[channel]
      expect(typeof def.input.safeParse).toBe('function')
      expect(typeof def.output.safeParse).toBe('function')
    }
  })

  it('as listas de canais refletem o contrato', () => {
    expect(invokeChannels).toEqual(Object.keys(invokeContract))
    expect(eventChannels).toEqual(Object.keys(eventContract))
  })

  it('canais sem payload aceitam undefined e rejeitam objetos', () => {
    expect(invokeContract['env:get'].input.safeParse(undefined).success).toBe(true)
    expect(invokeContract['env:get'].input.safeParse({ x: 1 }).success).toBe(false)
  })

  it('containers:list valida o flag all', () => {
    expect(invokeContract['containers:list'].input.safeParse({ all: true }).success).toBe(true)
    expect(invokeContract['containers:list'].input.safeParse({ all: 'sim' }).success).toBe(false)
    expect(invokeContract['containers:list'].input.safeParse(undefined).success).toBe(false)
  })

  it('containers:action restringe a ação ao enum', () => {
    const input = invokeContract['containers:action'].input
    expect(input.safeParse({ action: 'stop', id: 'abc' }).success).toBe(true)
    expect(input.safeParse({ action: 'explodir', id: 'abc' }).success).toBe(false)
    expect(input.safeParse({ action: 'stop', id: '' }).success).toBe(false)
  })

  it('streams:stop exige id positivo', () => {
    const input = invokeContract['streams:stop'].input
    expect(input.safeParse({ streamId: 3 }).success).toBe(true)
    expect(input.safeParse({ streamId: 0 }).success).toBe(false)
    expect(input.safeParse({ streamId: -1 }).success).toBe(false)
  })
})
