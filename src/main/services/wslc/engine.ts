import { app } from 'electron'
import type { Engine, EngineStatus } from '@shared/schemas'
import { logInfo } from '../logger'
import { readEngineSetting, settingsFilePath, writeEngineSetting } from '../../settings'
import { NATIVE_SESSION_NAME } from './native/session'
import { ops } from './ops'

/**
 * Motor de execução do app: CLI (wslc.exe) ou nativo (wslcsdk.dll via FFI).
 * Fase 1: o motor nativo cobre listagem/remoção de imagens; o resto segue na CLI.
 */

let engine: Engine | null = null

function settingsFile(): string {
  return settingsFilePath(app.getPath('userData'))
}

export function currentEngine(): Engine {
  engine ??= readEngineSetting(settingsFile())
  return engine
}

function detailFor(current: Engine): string {
  if (current === 'cli') return 'Comandos executados pela CLI (wslc.exe).'
  return ops().native.isSessionActive()
    ? `Sessão nativa "${NATIVE_SESSION_NAME}" ativa (wslcsdk.dll via FFI).`
    : `Motor nativo selecionado — a sessão "${NATIVE_SESSION_NAME}" será criada na primeira operação.`
}

export function getEngineStatus(): EngineStatus {
  const current = currentEngine()
  return { engine: current, sessionActive: ops().native.isSessionActive(), detail: detailFor(current) }
}

/**
 * Troca o motor. Ao ativar o nativo, a sessão é criada na hora — se falhar,
 * o app permanece na CLI e o motivo volta no `detail`.
 */
export async function setEngine(next: Engine): Promise<EngineStatus> {
  if (next === 'native') {
    try {
      await ops().native.ensureSession()
    } catch (e) {
      engine = 'cli'
      writeEngineSetting(settingsFile(), 'cli')
      return {
        engine: 'cli',
        sessionActive: false,
        detail: `Falha ao criar a sessão nativa: ${e instanceof Error ? e.message : String(e)}`
      }
    }
  }
  // Voltar para a CLI NÃO solta a sessão nativa: containers nativos podem
  // estar rodando e os handles precisam continuar vivos até o app fechar.
  engine = next
  writeEngineSetting(settingsFile(), next)
  logInfo('engine', `Motor alterado para "${next === 'native' ? 'nativo (wslcsdk)' : 'CLI (wslc.exe)'}"`)
  return getEngineStatus()
}
