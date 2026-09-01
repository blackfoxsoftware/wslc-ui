import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { CommandResult } from '@shared/schemas'
import { logDebug, logWarn } from '../logger'

/**
 * O wslc.exe é instalado em C:\Program Files\WSL, que nem sempre está no
 * PATH do processo. Resolve para o caminho absoluto quando existir.
 */
export function resolveWslcPath(env: NodeJS.ProcessEnv = process.env, exists = existsSync): string {
  const override = env['WSLC_UI_WSLC_PATH']
  if (override && exists(override)) return override
  const programFiles = `${env['ProgramFiles'] ?? 'C:\\Program Files'}\\WSL\\wslc.exe`
  if (exists(programFiles)) return programFiles
  return 'wslc.exe'
}

export const WSLC = resolveWslcPath()

/**
 * wsl.exe emite UTF-16LE; wslc.exe (e a maioria das CLIs) emite UTF-8.
 * Detecta pela presença de bytes nulos.
 */
export function decodeOutput(buf: Buffer): string {
  if (buf.includes(0)) {
    return buf.toString('utf16le').replaceAll('\u0000', '')
  }
  return buf.toString('utf8')
}

/**
 * Executa um binário sem shell (imune a injeção) e captura stdout/stderr.
 * `stdin` alimenta a entrada do processo (ex.: `login --password-stdin`,
 * que evita a senha na linha de comando) e nunca aparece nos logs.
 */
export function runCommand(
  file: string,
  args: string[],
  timeoutMs = 120_000,
  stdin?: string
): Promise<CommandResult> {
  const startedAt = Date.now()
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, encoding: 'buffer', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        let code: number | null = 0
        if (error) {
          code = typeof error.code === 'number' ? error.code : null
        }
        const result: CommandResult = {
          ok: !error,
          code,
          stdout: decodeOutput(stdout as unknown as Buffer),
          stderr: error && code === null ? String(error.message) : decodeOutput(stderr as unknown as Buffer)
        }
        const label = `${basename(file, '.exe')} ${args.join(' ')}`
        const elapsed = Date.now() - startedAt
        if (result.ok) logDebug('cli', `${label} — ok em ${elapsed}ms`)
        else logWarn('cli', `${label} — saiu com código ${code ?? '?'} em ${elapsed}ms`, result.stderr)
        resolve(result)
      }
    )
    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}

export const wslc = (args: string[], timeoutMs?: number, stdin?: string): Promise<CommandResult> =>
  runCommand(WSLC, args, timeoutMs, stdin)
