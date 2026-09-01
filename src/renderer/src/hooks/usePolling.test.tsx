import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('executa imediatamente e depois a cada intervalo', () => {
    const fn = vi.fn()
    renderHook(() => usePolling(fn, 1000))
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('para no unmount', () => {
    const fn = vi.fn()
    const { unmount } = renderHook(() => usePolling(fn, 1000))
    unmount()
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('mudar o restartKey reinicia com execução imediata', () => {
    const fn = vi.fn()
    const { rerender } = renderHook(({ key }) => usePolling(fn, 1000, key), { initialProps: { key: 'a' } })
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ key: 'b' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('usa sempre a referência mais recente de fn', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => usePolling(fn, 1000), { initialProps: { fn: first } })
    rerender({ fn: second })
    vi.advanceTimersByTime(1000)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
