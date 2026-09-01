import { describe, expect, it, vi } from 'vitest'
import type { StreamDataEvent, StreamExitEvent, StreamProgressEvent } from '@shared/schemas'
import { installWslcApiMock } from '../test/wslc-api'
import { initStreamSubscriptions, useStreamStore } from './stream-store'

describe('useStreamStore', () => {
  it('open cria o stream e encerra o anterior se ainda roda', async () => {
    const api = installWslcApiMock()
    const { open } = useStreamStore.getState()

    await open('Logs — web', async () => 1)
    expect(useStreamStore.getState().stream).toEqual({
      id: 1,
      title: 'Logs — web',
      output: '',
      running: true,
      exitCode: null,
      layers: []
    })

    await open('Pull — alpine', async () => 2)
    expect(api.stopStream).toHaveBeenCalledWith(1)
    expect(useStreamStore.getState().stream?.id).toBe(2)
  })

  it('append e finish só afetam o stream ativo', async () => {
    installWslcApiMock()
    const { open, append, finish } = useStreamStore.getState()
    await open('Logs', async () => 5)

    append(99, 'ignorado')
    append(5, 'linha 1\n')
    append(5, 'linha 2\n')
    finish(99, 1)
    expect(useStreamStore.getState().stream).toMatchObject({ output: 'linha 1\nlinha 2\n', running: true })

    finish(5, 0)
    expect(useStreamStore.getState().stream).toMatchObject({ running: false, exitCode: 0 })
  })

  it('progress substitui as camadas apenas do stream ativo', async () => {
    installWslcApiMock()
    const { open, progress } = useStreamStore.getState()
    await open('Pull — busybox', async () => 8)

    const layer = { id: 'abc123', status: 'downloading' as const, current: 10, total: 100 }
    progress(99, [layer])
    expect(useStreamStore.getState().stream?.layers).toEqual([])

    progress(8, [layer])
    progress(8, [{ ...layer, status: 'complete' as const, current: 100 }])
    expect(useStreamStore.getState().stream?.layers).toEqual([
      { id: 'abc123', status: 'complete', current: 100, total: 100 }
    ])
  })

  it('close para o processo em execução e limpa o painel', async () => {
    const api = installWslcApiMock()
    const { open, close } = useStreamStore.getState()
    await open('Logs', async () => 3)

    await close()
    expect(api.stopStream).toHaveBeenCalledWith(3)
    expect(useStreamStore.getState().stream).toBeNull()
  })

  it('initStreamSubscriptions liga os eventos IPC à store', async () => {
    let onData: ((ev: StreamDataEvent) => void) | undefined
    let onProgress: ((ev: StreamProgressEvent) => void) | undefined
    let onExit: ((ev: StreamExitEvent) => void) | undefined
    installWslcApiMock({
      onStreamData: vi.fn((cb) => {
        onData = cb
        return () => {}
      }),
      onStreamProgress: vi.fn((cb) => {
        onProgress = cb
        return () => {}
      }),
      onStreamExit: vi.fn((cb) => {
        onExit = cb
        return () => {}
      })
    })
    const off = initStreamSubscriptions()
    await useStreamStore.getState().open('Pull', async () => 7)

    onData?.({ id: 7, chunk: 'baixando…\n' })
    onProgress?.({ id: 7, layers: [{ id: 'aaa', status: 'downloading', current: 1, total: 2 }] })
    onExit?.({ id: 7, code: 0 })
    expect(useStreamStore.getState().stream).toMatchObject({
      output: 'baixando…\n',
      layers: [{ id: 'aaa', status: 'downloading', current: 1, total: 2 }],
      running: false,
      exitCode: 0
    })
    off()
  })
})
