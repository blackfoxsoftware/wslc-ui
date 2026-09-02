import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { engineSchema, nativeTuningSchema, type Engine, type NativeTuning } from '@shared/schemas'

/** IO injetável para testes. */
export interface SettingsIo {
  read: (file: string) => string
  write: (file: string, data: string) => void
}

const defaultIo: SettingsIo = {
  read: (file) => readFileSync(file, 'utf8'),
  write: (file, data) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data, 'utf8')
  }
}

export function settingsFilePath(userDataDir: string): string {
  return join(userDataDir, 'settings.json')
}

/** Motor persistido; qualquer problema (arquivo ausente, JSON podre) cai em 'cli'. */
export function readEngineSetting(file: string, io: SettingsIo = defaultIo): Engine {
  try {
    const parsed: unknown = JSON.parse(io.read(file))
    return engineSchema.parse((parsed as { engine?: unknown }).engine)
  } catch {
    return 'cli'
  }
}

function readAll(file: string, io: SettingsIo): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(io.read(file))
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // primeiro save
  }
  return {}
}

/** Grava o motor preservando outras chaves já existentes no settings.json. */
export function writeEngineSetting(file: string, engine: Engine, io: SettingsIo = defaultIo): void {
  io.write(file, JSON.stringify({ ...readAll(file, io), engine }, null, 2))
}

/** Tuning da sessão nativa; qualquer problema devolve o padrão ({} = defaults do WSL). */
export function readNativeTuning(file: string, io: SettingsIo = defaultIo): NativeTuning {
  try {
    const parsed: unknown = JSON.parse(io.read(file))
    return nativeTuningSchema.parse((parsed as { nativeTuning?: unknown }).nativeTuning ?? {})
  } catch {
    return {}
  }
}

/** Grava o tuning preservando as outras chaves do settings.json. */
export function writeNativeTuning(file: string, tuning: NativeTuning, io: SettingsIo = defaultIo): void {
  io.write(file, JSON.stringify({ ...readAll(file, io), nativeTuning: tuning }, null, 2))
}

/**
 * Caminho da wslcsdk.dll escolhido na aba Sistema. null = usar a empacotada.
 *
 * Fica no settings.json (e não numa variável de ambiente) porque é escolha de
 * quem usa o app, não de quem o desenvolve — e precisa sobreviver ao reinício,
 * já que a troca de DLL só vale na próxima abertura.
 */
export function readSdkPath(file: string, io: SettingsIo = defaultIo): string | null {
  try {
    const parsed: unknown = JSON.parse(io.read(file))
    const value = (parsed as { sdkPath?: unknown }).sdkPath
    return typeof value === 'string' && value.trim() !== '' ? value : null
  } catch {
    return null
  }
}

export function writeSdkPath(file: string, path: string | null, io: SettingsIo = defaultIo): void {
  const atual = readAll(file, io)
  if (path === null) delete atual['sdkPath']
  io.write(file, JSON.stringify(path === null ? atual : { ...atual, sdkPath: path }, null, 2))
}
