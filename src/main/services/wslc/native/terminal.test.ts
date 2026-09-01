import { afterAll, describe, expect, it } from 'vitest'
import type { TerminalDataEvent, TerminalExitEvent } from '@shared/schemas'
import { closeTerminal, writeTerminal } from '../terminals'
import { cleanupNativeContainers, runNativeContainer } from './containers'
import { locateWslcSdk } from './locate'
import { releaseNativeSession } from './session'
import { openNativeTerminal } from './terminal'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const uniq = Date.now().toString(36)

// oxlint-disable no-await-in-loop -- polling intencional (callbacks mudam o estado)

interface MemorySink {
  output: string
  exits: TerminalExitEvent[]
  data(ev: TerminalDataEvent): void
  exit(ev: TerminalExitEvent): void
}

function memorySink(): MemorySink {
  const sink: MemorySink = {
    output: '',
    exits: [],
    data: (ev) => {
      sink.output += ev.chunk
    },
    exit: (ev) => sink.exits.push(ev)
  }
  return sink
}

// Integração real: shell persistente via bridge FIFO dentro de um container
// nativo (exige a wslcsdk.dll e a imagem alpine:latest na sessão nativa).
describe.skipIf(locateWslcSdk() === null)('terminal nativo (integração real via FFI)', () => {
  afterAll(async () => {
    await cleanupNativeContainers()
    releaseNativeSession()
  }, 30_000)

  it('abre shell, mantém estado entre linhas e sai com exit', { timeout: 120_000 }, async () => {
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: `wslcuiterm${uniq}`,
      command: 'sleep 120',
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)
    const shortId = res.stdout

    const sink = memorySink()
    const id = await openNativeTerminal(shortId, sink)
    expect(id).toBeGreaterThan(0)

    // prompt do sh -i chega pelos callbacks (stderr)
    for (let i = 0; i < 60 && !/[#$] /.test(sink.output); i++) await sleep(250)
    expect(sink.output, sink.output).toMatch(/[#$] /)

    await writeTerminal(id, 'echo term-$((4+4))')
    for (let i = 0; i < 60 && !sink.output.includes('term-8'); i++) await sleep(250)
    expect(sink.output).toContain('term-8')

    // estado persiste entre linhas (é o MESMO shell, não um exec por comando)
    await writeTerminal(id, 'cd /etc && export FOO=fifo')
    await writeTerminal(id, 'echo "$PWD|$FOO"')
    for (let i = 0; i < 60 && !sink.output.includes('/etc|fifo'); i++) await sleep(250)
    expect(sink.output).toContain('/etc|fifo')

    await writeTerminal(id, 'exit 9')
    for (let i = 0; i < 60 && sink.exits.length === 0; i++) await sleep(250)
    expect(sink.exits[0]?.code).toBe(9)
  })

  it('container desconhecido dá erro claro', async () => {
    await expect(openNativeTerminal('naoexiste', memorySink())).rejects.toThrow('não encontrado')
  })

  it('close mata o shell e emite exit', { timeout: 120_000 }, async () => {
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: `wslcuiterm2${uniq}`,
      command: 'sleep 120',
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)

    const sink = memorySink()
    const id = await openNativeTerminal(res.stdout, sink)
    for (let i = 0; i < 60 && !/[#$] /.test(sink.output); i++) await sleep(250)

    await closeTerminal(id)
    for (let i = 0; i < 60 && sink.exits.length === 0; i++) await sleep(250)
    expect(sink.exits).toHaveLength(1)
  })
})
