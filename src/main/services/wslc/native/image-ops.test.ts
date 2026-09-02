import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StreamDataEvent, StreamExitEvent, StreamProgressEvent } from '@shared/schemas'
import { stopStream, type StreamSink } from '../streams'
import { importNativeImage, pullNativeImage, pushNativeImage, tagNativeImage } from './image-ops'
import { isNativeUsable } from './status'
import { listNativeImages, releaseNativeSession, removeNativeImage } from './session'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// oxlint-disable no-await-in-loop -- polling intencional (streams assíncronos)

interface MemorySink extends StreamSink {
  output: string
  exits: StreamExitEvent[]
  snapshots: StreamProgressEvent[]
}

function memorySink(): MemorySink {
  const sink: MemorySink = {
    output: '',
    exits: [],
    snapshots: [],
    data: (ev: StreamDataEvent) => {
      sink.output += ev.chunk
    },
    exit: (ev) => sink.exits.push(ev),
    progress: (ev) => sink.snapshots.push(ev)
  }
  return sink
}

async function waitExit(sink: MemorySink, timeoutMs = 90_000): Promise<StreamExitEvent> {
  for (let waited = 0; sink.exits.length === 0 && waited < timeoutMs; waited += 250) await sleep(250)
  expect(sink.exits.length, `stream não terminou — saída: ${sink.output}`).toBeGreaterThan(0)
  return sink.exits[0]
}

async function hasImage(name: string): Promise<boolean> {
  const images = await listNativeImages()
  return images.some((img) => `${img.repository}:${img.tag}` === name)
}

// Integração real: pull com progresso estruturado, tag e import de tarball na
// sessão nativa (exige a wslcsdk.dll e rede para o Docker Hub).
describe.skipIf(!isNativeUsable())('imagens nativas (integração real via FFI)', () => {
  beforeAll(async () => {
    // Sobra de execução anterior invalidaria o teste de cancelamento.
    await removeNativeImage('busybox:latest').catch(() => null)
  }, 60_000)

  afterAll(async () => {
    await removeNativeImage('busybox:latest').catch(() => null)
    releaseNativeSession()
  }, 30_000)

  it('cancela o pull quando o stream é parado', { timeout: 120_000 }, async () => {
    const sink = memorySink()
    const id = pullNativeImage('busybox:latest', sink)
    // O kill marca o cancelamento — o primeiro callback de progresso aborta.
    stopStream(id)
    const exit = await waitExit(sink)
    expect(exit.code).toBe(1)
    expect(sink.output).toContain('Pull cancelado')
    expect(await hasImage('busybox:latest')).toBe(false)
  })

  it('pull com progresso estruturado por camada', { timeout: 120_000 }, async () => {
    const sink = memorySink()
    const id = pullNativeImage('busybox:latest', sink)
    expect(id).toBeGreaterThan(0)

    const exit = await waitExit(sink)
    expect(exit.code, sink.output).toBe(0)
    expect(sink.output).toContain('concluído')

    // Pelo menos um snapshot com camada e todas concluídas no último.
    expect(sink.snapshots.length).toBeGreaterThan(0)
    const last = sink.snapshots.at(-1)
    expect(last?.layers.length).toBeGreaterThan(0)
    expect(last?.layers.every((l) => typeof l.id === 'string' && l.id.length > 0)).toBe(true)

    expect(await hasImage('busybox:latest')).toBe(true)
  })

  it('pull de referência inexistente falha com mensagem legível', { timeout: 120_000 }, async () => {
    const sink = memorySink()
    pullNativeImage('wslcui-nao-existe-xyz:latest', sink)
    const exit = await waitExit(sink)
    expect(exit.code).toBe(1)
    expect(sink.output).toMatch(/Erro:/)
  })

  it('tag cria uma referência nova e delete a remove', { timeout: 60_000 }, async () => {
    const res = await tagNativeImage('busybox:latest', 'wslcui-teste-tag:v1')
    expect(res.ok, res.stderr).toBe(true)
    expect(await hasImage('wslcui-teste-tag:v1')).toBe(true)

    const del = await removeNativeImage('wslcui-teste-tag:v1')
    expect(del.ok, del.stderr).toBe(true)
    expect(await hasImage('wslcui-teste-tag:v1')).toBe(false)
  })

  it('tag de imagem inexistente devolve erro', { timeout: 60_000 }, async () => {
    const res = await tagNativeImage('wslcui-nao-existe-xyz:latest', 'qualquer:v1')
    expect(res.ok).toBe(false)
    expect(res.stderr.length).toBeGreaterThan(0)
  })

  it('push de imagem que não existe localmente falha com mensagem legível', { timeout: 60_000 }, async () => {
    const sink = memorySink()
    pushNativeImage('127.0.0.1:59999/wslcui-nao-existe:latest', sink)
    const exit = await waitExit(sink)
    expect(exit.code).toBe(1)
    expect(sink.output).toContain('Enviando')
    expect(sink.output).toMatch(/Erro:/)
  })

  it('push para registry inalcançável falha com mensagem legível', { timeout: 90_000 }, async () => {
    // O sucesso do push (com registry:2 local + progresso + cancelamento) foi
    // validado por probe e é coberto pelo smoke — aqui só o caminho de erro.
    const ref = '127.0.0.1:59999/wslcui-teste-push:latest'
    const tag = await tagNativeImage('busybox:latest', ref)
    expect(tag.ok, tag.stderr).toBe(true)
    try {
      const sink = memorySink()
      pushNativeImage(ref, sink)
      const exit = await waitExit(sink)
      expect(exit.code).toBe(1)
      expect(sink.output).toMatch(/Erro:/)
    } finally {
      await removeNativeImage(ref).catch(() => null)
    }
  })

  it('import de tarball rootfs cria uma imagem', { timeout: 120_000 }, async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wslcui-import-'))
    try {
      const rootfs = join(tmp, 'rootfs')
      mkdirSync(join(rootfs, 'etc'), { recursive: true })
      writeFileSync(join(rootfs, 'etc', 'wslcui-release'), 'teste import fase 4\n')
      const tarPath = join(tmp, 'rootfs.tar')
      // Caminhos relativos + cwd: o GNU tar (Git Bash) trata "C:" como host
      // remoto; o bsdtar do Windows não — relativo funciona nos dois.
      execFileSync('tar', ['-cf', 'rootfs.tar', '-C', 'rootfs', '.'], { cwd: tmp })

      const sink = memorySink()
      importNativeImage(tarPath, 'wslcui-teste-import:v1', sink)
      const exit = await waitExit(sink)
      expect(exit.code, sink.output).toBe(0)
      expect(await hasImage('wslcui-teste-import:v1')).toBe(true)

      const del = await removeNativeImage('wslcui-teste-import:v1')
      expect(del.ok, del.stderr).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
