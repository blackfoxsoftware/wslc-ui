import { existsSync, rmSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import type { NativeCrashDumpEvent } from '@shared/schemas'
import {
  cleanupNativeContainers,
  execNativeContainer,
  nativeContainerAction,
  runNativeContainer
} from './containers'
import { mapCrashDump, signalName } from './crash-dumps'
import { locateWslcSdk } from './locate'
import { releaseNativeSession, setOnNativeCrashDump } from './session'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const uniq = Date.now().toString(36)

// oxlint-disable no-await-in-loop -- polling intencional (callback assíncrono)

describe('mapCrashDump (puro)', () => {
  it('troca "!" por "/" no processName e deriva o nome do sinal', () => {
    const ev = mapCrashDump({
      dumpPath: 'C:\\dumps\\wsl-crash-1-7-x-11.dmp',
      processName: '!bin!busybox',
      pid: 7,
      signal: 11,
      timestamp: 1788227901n
    })
    expect(ev).toEqual({
      dumpPath: 'C:\\dumps\\wsl-crash-1-7-x-11.dmp',
      processName: '/bin/busybox',
      pid: 7,
      signal: 11,
      signalName: 'SIGSEGV',
      timestamp: 1788227901
    })
  })

  it('campos nulos viram vazios e sinal desconhecido vira "sinal N"', () => {
    const ev = mapCrashDump({ dumpPath: null, processName: null, pid: 0, signal: 42, timestamp: 0 })
    expect(ev.dumpPath).toBe('')
    expect(ev.processName).toBe('')
    expect(ev.signalName).toBe('sinal 42')
  })

  it('nomeia os sinais que geram core dump', () => {
    expect(signalName(6)).toBe('SIGABRT')
    expect(signalName(8)).toBe('SIGFPE')
    expect(signalName(3)).toBe('SIGQUIT')
    expect(signalName(4)).toBe('SIGILL')
  })
})

// Integração real: crash de um processo dentro de um container da sessão
// nativa (exige a wslcsdk.dll e a imagem alpine:latest já puxada).
describe.skipIf(locateWslcSdk() === null)('crash dumps (integração real via FFI)', () => {
  afterAll(async () => {
    setOnNativeCrashDump(() => {})
    await cleanupNativeContainers()
    releaseNativeSession()
  }, 30_000)

  it(
    'SIGSEGV em processo não-init dispara o callback com o .dmp no disco',
    { timeout: 120_000 },
    async () => {
      const events: NativeCrashDumpEvent[] = []
      setOnNativeCrashDump((ev) => events.push(ev))

      const res = await runNativeContainer({
        image: 'alpine:latest',
        name: `wslcuicrash${uniq}`,
        command: 'sleep 60',
        detach: true,
        rm: false
      })
      expect(res.ok, res.stderr).toBe(true)
      const shortId = res.stdout
      try {
        // O exec roda como `sh -c '<cmd>'` — não é o init (PID 1), então o
        // SIGSEGV mata e gera dump mesmo com ulimit -c 0 (core_pattern é o
        // pipe |/wsl-capture-crash, que ignora RLIMIT_CORE — regra 17).
        await execNativeContainer(shortId, 'kill -SEGV $$')
        for (let i = 0; i < 120 && events.length === 0; i++) await sleep(250)
        expect(events.length, 'callback de crash não chegou em 30s').toBeGreaterThan(0)

        const ev = events[0]
        expect(ev.signal).toBe(11)
        expect(ev.signalName).toBe('SIGSEGV')
        // "!" do SDK traduzido para "/" (caminho do executável no container)
        expect(ev.processName.startsWith('/')).toBe(true)
        // timestamp em SEGUNDOS epoch (não ms)
        expect(Math.abs(ev.timestamp - Date.now() / 1000)).toBeLessThan(120)
        expect(existsSync(ev.dumpPath), `dump não existe: ${ev.dumpPath}`).toBe(true)
        // não acumular lixo na máquina (o dump é nosso)
        rmSync(ev.dumpPath, { force: true })
      } finally {
        await nativeContainerAction('remove', shortId).catch(() => null)
      }
    }
  )
})
