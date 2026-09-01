import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SdkSource } from '@shared/schemas'
import { bundledPath, detectWslVersion, pickBundledSdk } from './bundled'

/**
 * Onde achar a wslcsdk.dll, e de onde ela veio.
 *
 * A procedência importa porque a versão da DLL decide se o motor nativo
 * funciona — e, pior, decide COMO chamá-la: entre 2.9.3 e 2.9.9 duas
 * assinaturas mudaram (ver SdkAbi em bindings.ts). Por isso a aba Sistema
 * mostra o caminho e a origem, e deixa escolher outra DLL.
 */

export interface SdkLocation {
  path: string
  source: SdkSource
}

/**
 * Caminho escolhido pela pessoa na aba Sistema (persistido no settings.json).
 *
 * Fica em módulo, e não em parâmetro, porque `locateWslcSdk()` é chamado de
 * uma dúzia de lugares que não têm — nem deveriam ter — acesso às settings.
 * O main injeta na subida e a cada troca.
 */
let customPath: string | null = null

export function setCustomSdkPath(path: string | null): void {
  customPath = path
}

export function getCustomSdkPath(): string | null {
  return customPath
}

export interface LocateOptions {
  env?: NodeJS.ProcessEnv
  /** Raiz do projeto em desenvolvimento (cwd). */
  appRoot?: string
  /** `process.resourcesPath` no app empacotado; a DLL vai como extraResource. */
  resourcesRoot?: string | null
  /** Sobrepõe o caminho escolhido pela pessoa (testes). */
  custom?: string | null
  /**
   * Versão do WSL, que decide QUAL DLL empacotada usar (ver bundled.ts).
   * Ausente = pergunta à DLL base, memoizado por processo.
   */
  wslVersion?: string | null
  exists?: (p: string) => boolean
}

/**
 * Candidatos, em ordem de precedência:
 * 1. `WSLC_SDK_DLL` — override de desenvolvimento, usado por scripts e sondas
 * 2. escolha da pessoa na aba Sistema
 * 3. DLL empacotada com o app (resources no instalado, vendor/ no dev)
 * 4. instalação do WSL em Program Files
 */
export function sdkCandidates(options: LocateOptions = {}): SdkLocation[] {
  const {
    env = process.env,
    appRoot = process.cwd(),
    resourcesRoot = (process as { resourcesPath?: string }).resourcesPath ?? null,
    custom = customPath
  } = options

  const candidates: SdkLocation[] = []
  const override = env['WSLC_SDK_DLL']
  if (override) candidates.push({ path: override, source: 'env' })
  if (custom) candidates.push({ path: custom, source: 'custom' })

  // Empacotadas: QUAL delas depende da versão do WSL — ver bundled.ts.
  const roots = resourcesRoot ? [resourcesRoot, appRoot] : [appRoot]
  const wsl = options.wslVersion === undefined ? detectWslVersion(roots, options.exists) : options.wslVersion
  const escolhida = pickBundledSdk(wsl)
  for (const root of roots) candidates.push({ path: bundledPath(escolhida, root), source: 'bundled' })

  candidates.push({
    path: join(env['ProgramFiles'] ?? 'C:\\Program Files', 'WSL', 'wslcsdk.dll'),
    source: 'system'
  })
  return candidates
}

/** Primeiro candidato que existe em disco, com a origem. */
export function locateSdk(options: LocateOptions = {}): SdkLocation | null {
  const exists = options.exists ?? existsSync
  return sdkCandidates(options).find((c) => exists(c.path)) ?? null
}

/** Só o caminho — a forma usada pela maior parte do código nativo. */
export function locateWslcSdk(options: LocateOptions = {}): string | null {
  return locateSdk(options)?.path ?? null
}
