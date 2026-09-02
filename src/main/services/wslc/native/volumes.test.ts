import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { isNativeUsable } from './status'
import { releaseNativeSession } from './session'
import {
  createNativeVolume,
  deleteNativeVolume,
  inspectNativeVolume,
  listNativeVolumes,
  vhdxToVolume,
  volumesDir
} from './volumes'

describe('vhdxToVolume (mapeamento puro)', () => {
  it('mapeia um .vhdx para a linha da view', () => {
    expect(vhdxToVolume('dados.vhdx', 4096, 'C:\\storage\\volumes')).toEqual({
      name: 'dados',
      driver: 'vhd',
      mountpoint: join('C:\\storage\\volumes', 'dados.vhdx'),
      scope: 'local',
      sizeBytes: 4096
    })
  })

  it('ignora arquivos que não são .vhdx', () => {
    expect(vhdxToVolume('outro.txt', 10, 'C:\\x')).toBeNull()
    expect(vhdxToVolume('sem-extensao', 10, 'C:\\x')).toBeNull()
  })

  it('aceita extensão em qualquer caixa', () => {
    expect(vhdxToVolume('A.VHDX', 1, 'C:\\x')?.name).toBe('A')
  })
})

// Integração real: cria/lista/remove volumes VHDX na sessão nativa.
describe.skipIf(!isNativeUsable())('volumes VHD nativos (integração real via FFI)', () => {
  const NAME = 'wslcui-teste-vol'
  const NAME_FIXO = 'wslcui-teste-vol-fixo'

  afterAll(async () => {
    await deleteNativeVolume(NAME).catch(() => null)
    await deleteNativeVolume(NAME_FIXO).catch(() => null)
    releaseNativeSession()
  }, 30_000)

  /**
   * A referência oficial da API C lista `WSLC_VHD_TYPE_FIXED` em
   * "Not Yet Implemented APIs": `WslcCreateSessionVhdVolume` com esse tipo
   * deveria devolver E_NOTIMPL. A CLI, por outro lado, cria VHDX fixo de
   * verdade com `-o Fixed=true` (medido: 109 MB pré-alocados contra 37 MB do
   * dinâmico), então os dois caminhos podem divergir.
   *
   * Este teste existe para dizer qual dos dois vale AQUI: a UI oferece "Fixo"
   * no motor nativo, e se o SDK recusa, a opção não pode ficar na tela. O
   * teste passa nos dois casos e REGISTRA o que aconteceu — o que ele proíbe é
   * o meio-termo: falhar com uma mensagem que não explica nada.
   */
  it('diz se o VHD FIXO funciona ou recusa com mensagem legível', { timeout: 60_000 }, async () => {
    const res = await createNativeVolume(NAME_FIXO, { sizeMb: 64, fixed: true })
    if (res.ok) {
      expect(existsSync(join(volumesDir(), `${NAME_FIXO}.vhdx`))).toBe(true)
      return
    }
    // Recusou: a mensagem precisa dizer o porquê, não só um HRESULT cru.
    expect(res.stderr).toMatch(/fixo|E_NOTIMPL|0x80004001/i)
  })

  it('create gera o .vhdx no storage e a listagem o encontra', { timeout: 60_000 }, async () => {
    const res = await createNativeVolume(NAME, { sizeMb: 64, fixed: false })
    expect(res.ok, res.stderr).toBe(true)
    expect(existsSync(join(volumesDir(), `${NAME}.vhdx`))).toBe(true)

    const listed = await listNativeVolumes()
    const vol = listed.find((v) => v.name === NAME)
    expect(vol).toBeDefined()
    expect(vol?.driver).toBe('vhd')
    expect(vol?.sizeBytes ?? 0).toBeGreaterThan(0)
  })

  it('criar duplicado devolve erro legível', { timeout: 60_000 }, async () => {
    const res = await createNativeVolume(NAME, { sizeMb: 64, fixed: false })
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('Já existe')
  })

  it('inspect devolve os metadados do .vhdx em JSON', { timeout: 60_000 }, async () => {
    const res = await inspectNativeVolume(NAME)
    expect(res.ok, res.stderr).toBe(true)
    const [payload] = JSON.parse(res.stdout) as Array<Record<string, unknown>>
    expect(payload['Name']).toBe(NAME)
    expect(payload['Driver']).toBe('vhd')
    expect(payload['SizeBytes'] as number).toBeGreaterThan(0)

    const missing = await inspectNativeVolume('wslcui-vol-que-nao-existe')
    expect(missing.ok).toBe(false)
    expect(missing.stderr).toContain('não encontrado')
  })

  it('delete remove o arquivo e o volume some da lista', { timeout: 60_000 }, async () => {
    const res = await deleteNativeVolume(NAME)
    expect(res.ok, res.stderr).toBe(true)
    expect(existsSync(join(volumesDir(), `${NAME}.vhdx`))).toBe(false)
    expect((await listNativeVolumes()).some((v) => v.name === NAME)).toBe(false)
  })

  it('delete de volume inexistente devolve a mensagem localizada do SDK', { timeout: 60_000 }, async () => {
    const res = await deleteNativeVolume('wslcui-vol-que-nao-existe')
    expect(res.ok).toBe(false)
    expect(res.stderr).toMatch(/não encontrado/i)
  })
})
