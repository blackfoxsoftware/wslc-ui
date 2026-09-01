import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Candidatos à wslcsdk.dll, em ordem de preferência:
 * 1. Override explícito (WSLC_SDK_DLL)
 * 2. DLL vendorizada com o app (vendor/wslcsdk, vinda do NuGet Microsoft.WSL.Containers)
 * 3. Instalação do WSL em Program Files
 */
export function sdkCandidates(
  env: NodeJS.ProcessEnv = process.env,
  appRoot: string = process.cwd()
): string[] {
  const candidates: string[] = []
  const override = env['WSLC_SDK_DLL']
  if (override) candidates.push(override)
  candidates.push(join(appRoot, 'vendor', 'wslcsdk', 'win-x64', 'wslcsdk.dll'))
  candidates.push(join(env['ProgramFiles'] ?? 'C:\\Program Files', 'WSL', 'wslcsdk.dll'))
  return candidates
}

export function locateWslcSdk(
  env: NodeJS.ProcessEnv = process.env,
  appRoot: string = process.cwd(),
  exists: (p: string) => boolean = existsSync
): string | null {
  return sdkCandidates(env, appRoot).find((p) => exists(p)) ?? null
}
