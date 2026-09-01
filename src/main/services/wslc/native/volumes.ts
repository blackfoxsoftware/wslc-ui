import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { CommandResult, VhdVolumeOptions, VolumeInfo } from '@shared/schemas'
import { logInfo } from '../../logger'
import { hrHex, hrOk, Keep } from './bindings'
import { acquireNativeSession, callNative, sessionStoragePath } from './session'

/**
 * Volumes VHD da sessão nativa (Fase 5): WslcCreateSessionVhdVolume cria um
 * arquivo `<storage>\volumes\<nome>.vhdx` — o SDK não tem enumeração, então
 * LISTAR é ler esse diretório. Volumes "guest" (auto-criados ao anexar um
 * nome inexistente a um container) vivem dentro do storage.vhdx e NÃO são
 * enumeráveis — só os VHD aparecem na view. Erros do delete já vêm
 * localizados ("Volume não encontrado: ...").
 */

const VHD_TYPE_DYNAMIC = 0
const VHD_TYPE_FIXED = 1
const VHD_FLAG_OWNER = 0x00000001

/** Diretório dos .vhdx no storage da sessão. */
export function volumesDir(storage: string = sessionStoragePath()): string {
  return join(storage, 'volumes')
}

/** Mapeia um arquivo .vhdx do storage para a linha da view de Volumes. */
export function vhdxToVolume(fileName: string, sizeBytes: number, dir: string): VolumeInfo | null {
  if (!fileName.toLowerCase().endsWith('.vhdx')) return null
  return {
    name: fileName.slice(0, -'.vhdx'.length),
    driver: 'vhd',
    mountpoint: join(dir, fileName),
    scope: 'local',
    sizeBytes
  }
}

/** Lista os volumes VHD lendo o diretório do storage (não precisa da sessão). */
export async function listNativeVolumes(): Promise<VolumeInfo[]> {
  const dir = volumesDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return [] // sessão nunca criou volume — o diretório não existe
  }
  const volumes = await Promise.all(
    entries.map(async (entry) => {
      // O arquivo pode sumir entre o readdir e o stat — tamanho vira 0.
      const size = await fs
        .stat(join(dir, entry))
        .then((s) => s.size)
        .catch(() => 0)
      return vhdxToVolume(entry, size, dir)
    })
  )
  return volumes.filter((v) => v !== null).toSorted((a, b) => a.name.localeCompare(b.name))
}

/** Cria um volume VHDX nomeado (tamanho, tipo e dono opcionais). */
export async function createNativeVolume(name: string, opts: VhdVolumeOptions): Promise<CommandResult> {
  const keep = new Keep()
  try {
    const { sdk, handle: session } = await acquireNativeSession()
    const errOut: (string | null)[] = [null]
    const hr = await callNative(
      sdk.raw['WslcCreateSessionVhdVolume'],
      session,
      {
        name: keep.ansi(name),
        sizeBytes: opts.sizeMb * 1024 * 1024,
        type: opts.fixed ? VHD_TYPE_FIXED : VHD_TYPE_DYNAMIC,
        flags: opts.owner ? VHD_FLAG_OWNER : 0,
        uid: opts.owner?.uid ?? 0,
        gid: opts.owner?.gid ?? 0
      },
      errOut
    )
    if (!hrOk(hr)) {
      // Duplicata devolve ERROR_ALREADY_EXISTS sem mensagem — traduz.
      const message =
        errOut[0] ||
        (hr >>> 0 === 0x800700b7
          ? `Já existe um volume chamado "${name}".`
          : `WslcCreateSessionVhdVolume falhou: ${hrHex(hr)}`)
      return { ok: false, code: 1, stdout: '', stderr: message }
    }
    logInfo(
      'native',
      `Volume VHD "${name}" criado (${opts.sizeMb}MB, ${opts.fixed ? 'fixo' : 'dinâmico'}` +
        (opts.owner ? `, dono ${opts.owner.uid}:${opts.owner.gid})` : ')')
    )
    return { ok: true, code: 0, stdout: '', stderr: '' }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * "Inspect" de um volume nativo: o SDK não tem inspeção — devolve os
 * metadados do arquivo .vhdx (JSON no formato do inspect da CLI).
 */
export async function inspectNativeVolume(name: string): Promise<CommandResult> {
  const dir = volumesDir()
  const path = join(dir, `${name}.vhdx`)
  try {
    const st = await fs.stat(path)
    const payload = [
      {
        Name: name,
        Driver: 'vhd',
        Mountpoint: path,
        SizeBytes: st.size,
        CreatedAt: st.birthtime.toISOString(),
        ModifiedAt: st.mtime.toISOString()
      }
    ]
    return { ok: true, code: 0, stdout: JSON.stringify(payload, null, 2), stderr: '' }
  } catch {
    return {
      ok: false,
      code: 1,
      stdout: '',
      stderr: `Volume não encontrado: '${name}' (só volumes VHD são inspecionáveis no motor nativo).`
    }
  }
}

/** Remove um volume da sessão nativa (VHD ou guest — o SDK apaga os dois). */
export async function deleteNativeVolume(name: string): Promise<CommandResult> {
  const keep = new Keep()
  try {
    const { sdk, handle: session } = await acquireNativeSession()
    const errOut: (string | null)[] = [null]
    const hr = await callNative(sdk.raw['WslcDeleteSessionVhdVolume'], session, keep.ansi(name), errOut)
    if (!hrOk(hr)) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr: errOut[0] || `WslcDeleteSessionVhdVolume falhou: ${hrHex(hr)}`
      }
    }
    logInfo('native', `Volume "${name}" removido da sessão nativa`)
    return { ok: true, code: 0, stdout: '', stderr: '' }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}
