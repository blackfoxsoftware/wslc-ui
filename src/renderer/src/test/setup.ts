import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { useContainersStore } from '../features/containers/store'
import { useRegistryStore } from '../features/images/registry-store'
import { useImagesStore } from '../features/images/store'
import { useLogsStore } from '../features/logs/store'
import { useVolumesStore } from '../features/volumes/store'
import { useConfirmStore } from '../stores/confirm-store'
import { useEngineStore } from '../stores/engine-store'
import { useEnvStore } from '../stores/env-store'
import { useStatsStore } from '../stores/stats-store'
import { useStreamStore } from '../stores/stream-store'
import { useWindowStore } from '../stores/window-store'

// APIs de DOM que o HeroUI/React Aria usa e o happy-dom não implementa.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}
if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as typeof window.matchMedia
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
// Web Animations API: o indicador das abas (SelectionIndicator do React Aria)
// consulta as animações em curso para deslizar do lugar antigo para o novo.
// Sem animação nenhuma no happy-dom, a lista vazia é a resposta correta.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}

interface ResettableStore<T> {
  setState: (state: T, replace: true) => void
  getInitialState: () => T
}

function reset<T>(store: ResettableStore<T>): void {
  store.setState(store.getInitialState(), true)
}

afterEach(() => {
  cleanup()
  // Stores zustand são singletons de módulo — restaura o estado inicial entre testes.
  reset(useConfirmStore)
  reset(useEngineStore)
  reset(useEnvStore)
  reset(useStatsStore)
  reset(useStreamStore)
  reset(useWindowStore)
  reset(useContainersStore)
  reset(useImagesStore)
  reset(useRegistryStore)
  reset(useVolumesStore)
  reset(useLogsStore)
})
