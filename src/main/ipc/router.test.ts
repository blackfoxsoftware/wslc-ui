import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandResult, WslcEnvironment } from '@shared/schemas'
import { invokeChannels } from '@shared/ipc/contract'

const handleMock = vi.fn()
const removeHandlerMock = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]) => handleMock(...args),
    removeHandler: (...args: unknown[]) => removeHandlerMock(...args)
  }
}))

import { registerInvokeHandlers, unregisterInvokeHandlers, type InvokeHandlers } from './router'

const okResult: CommandResult = { ok: true, code: 0, stdout: '', stderr: '' }
const envFixture: WslcEnvironment = {
  wslInstalled: true,
  wslVersion: '2.9.3.0',
  wslVersionOk: true,
  wslcAvailable: true,
  wslcVersion: 'mock',
  ready: true
}

function makeHandlers(overrides: Partial<InvokeHandlers> = {}): InvokeHandlers {
  return {
    'env:get': async () => envFixture,
    'containers:list': async () => [],
    'containers:action': async () => okResult,
    'containers:prune': async () => okResult,
    'containers:run': async () => okResult,
    'containers:exec': async () => okResult,
    'containers:logs': async () => 1,
    'containers:stats': async () => [],
    'containers:inspect': async () => okResult,
    'containers:open-terminal': () => undefined,
    'containers:kill': async () => okResult,
    'containers:export': async () => okResult,
    'images:list': async () => [],
    'images:pull': async () => 2,
    'images:remove': async () => okResult,
    'images:prune': async () => okResult,
    'images:inspect': async () => okResult,
    'images:tag': async () => okResult,
    'images:push': async () => 3,
    'images:build': async () => 4,
    'images:save': async () => okResult,
    'images:load': async () => 6,
    'images:import': async () => 7,
    'images:search-registry': async () => [],
    'registry:login': async () => okResult,
    'registry:logout': async () => okResult,
    'volumes:list': async () => [],
    'volumes:create': async () => okResult,
    'volumes:remove': async () => okResult,
    'volumes:prune': async () => okResult,
    'volumes:inspect': async () => okResult,
    'networks:list': async () => [],
    'networks:create': async () => okResult,
    'networks:remove': async () => okResult,
    'networks:prune': async () => okResult,
    'networks:inspect': async () => okResult,
    'networks:connect': async () => okResult,
    'networks:disconnect': async () => okResult,
    'system:terminate-session': async () => okResult,
    'system:sessions': async () => [],
    'system:open-wslc-settings': () => undefined,
    'system:reset-wslc-settings': async () => okResult,
    'system:get-native-tuning': async () => ({}),
    'system:set-native-tuning': () => undefined,
    'system:restart-native': async () => okResult,
    'system:native-status': async () => ({
      available: false,
      dllPath: null,
      source: null,
      wslVersion: null,
      abi: null,
      sizeBytes: null,
      missingComponents: [],
      detail: 'teste'
    }),
    'system:sdk-path': async () => null,
    'system:pick-sdk': async () => null,
    'system:set-sdk-path': () => undefined,
    'system:get-engine': async () => ({ engine: 'cli' as const, sessionActive: false, detail: 'teste' }),
    'system:set-engine': async () => ({ engine: 'cli' as const, sessionActive: false, detail: 'teste' }),
    'system:reset-native': async () => okResult,
    'system:pick-directory': async () => null,
    'system:pick-file': async () => null,
    'system:pick-save': async () => null,
    'system:open-external': () => undefined,
    'system:install-wslc': async () => okResult,
    'system:show-item': () => undefined,
    'streams:stop': () => undefined,
    'terminal:open': async () => 5,
    'terminal:write': () => undefined,
    'terminal:close': () => undefined,
    'logs:list': async () => [],
    'logs:clear': () => undefined,
    'logs:open-folder': () => undefined,
    'window:minimize': () => undefined,
    'window:toggle-maximize': () => true,
    'window:is-maximized': () => false,
    'window:close': () => undefined,
    ...overrides
  }
}

/** Recupera a função registrada no ipcMain.handle para um canal. */
function registered(channel: string): (event: unknown, raw: unknown) => Promise<unknown> {
  const call = handleMock.mock.calls.find(([ch]) => ch === channel)
  if (!call) throw new Error(`canal não registrado: ${channel}`)
  return call[1] as (event: unknown, raw: unknown) => Promise<unknown>
}

const fakeEvent = { sender: {} }

describe('registerInvokeHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear()
    removeHandlerMock.mockClear()
  })

  it('registra exatamente os canais do contrato', () => {
    registerInvokeHandlers(makeHandlers())
    const channels = handleMock.mock.calls.map(([ch]) => ch)
    expect(channels.toSorted()).toEqual(invokeChannels.toSorted())
  })

  it('valida a entrada e entrega o payload parseado ao handler', async () => {
    const list = vi.fn(async () => [])
    registerInvokeHandlers(makeHandlers({ 'containers:list': list }))
    const result = await registered('containers:list')(fakeEvent, { all: true })
    expect(result).toEqual([])
    expect(list).toHaveBeenCalledWith({ all: true }, { event: fakeEvent })
  })

  it('rejeita payload de entrada inválido antes do handler', async () => {
    const list = vi.fn(async () => [])
    registerInvokeHandlers(makeHandlers({ 'containers:list': list }))
    await expect(registered('containers:list')(fakeEvent, { all: 'sim' })).rejects.toThrow()
    expect(list).not.toHaveBeenCalled()
  })

  it('rejeita resposta que não cumpre o schema de saída', async () => {
    registerInvokeHandlers(
      makeHandlers({ 'env:get': async () => ({ podre: true }) as unknown as WslcEnvironment })
    )
    await expect(registered('env:get')(fakeEvent, undefined)).rejects.toThrow()
  })

  it('unregister remove todos os canais', () => {
    registerInvokeHandlers(makeHandlers())
    unregisterInvokeHandlers()
    expect(removeHandlerMock).toHaveBeenCalledTimes(invokeChannels.length)
  })
})
