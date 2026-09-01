import { describe, expect, it, vi } from 'vitest'
import type { WindowStateEvent } from '@shared/schemas'
import { installWslcApiMock } from '../test/wslc-api'
import { initWindowSubscriptions, useWindowStore } from './window-store'

describe('useWindowStore', () => {
  it('toggleMaximize grava o novo estado devolvido pelo main', async () => {
    const api = installWslcApiMock({ toggleMaximizeWindow: vi.fn(async () => true) })
    await useWindowStore.getState().toggleMaximize()
    expect(api.toggleMaximizeWindow).toHaveBeenCalled()
    expect(useWindowStore.getState().maximized).toBe(true)
  })

  it('refresh consulta o estado atual da janela', async () => {
    installWslcApiMock({ isWindowMaximized: vi.fn(async () => true) })
    await useWindowStore.getState().refresh()
    expect(useWindowStore.getState().maximized).toBe(true)
  })

  it('initWindowSubscriptions sincroniza eventos do main', () => {
    let emit: ((ev: WindowStateEvent) => void) | undefined
    installWslcApiMock({
      onWindowState: vi.fn((cb) => {
        emit = cb
        return () => {}
      })
    })
    const off = initWindowSubscriptions()
    emit?.({ maximized: true })
    expect(useWindowStore.getState().maximized).toBe(true)
    emit?.({ maximized: false })
    expect(useWindowStore.getState().maximized).toBe(false)
    off()
  })

  it('minimize e close delegam para a API', async () => {
    const api = installWslcApiMock()
    await useWindowStore.getState().minimize()
    await useWindowStore.getState().close()
    expect(api.minimizeWindow).toHaveBeenCalled()
    expect(api.closeWindow).toHaveBeenCalled()
  })
})
