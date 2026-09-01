import { statSync } from 'node:fs'
import type { NativeStatus } from '@shared/schemas'
import { hrHex, loadWslcSdk, WSLC_COMPONENT_FLAGS } from './bindings'
import { locateSdk } from './locate'

/** Nomes amigáveis dos componentes que podem faltar. */
export function missingComponentNames(flags: number): string[] {
  const names: string[] = []
  if (flags & WSLC_COMPONENT_FLAGS.VIRTUAL_MACHINE_PLATFORM) names.push('Virtual Machine Platform')
  if (flags & WSLC_COMPONENT_FLAGS.WSL_PACKAGE) names.push('Pacote WSL (>= 2.9.3)')
  if (flags & WSLC_COMPONENT_FLAGS.SDK_NEEDS_UPDATE) names.push('Atualização do SDK')
  return names
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/** Sonda a API nativa (wslcsdk.dll): presença, origem, ABI e componentes. */
export function getNativeStatus(): NativeStatus {
  const found = locateSdk()
  if (!found) {
    return {
      available: false,
      dllPath: null,
      source: null,
      wslVersion: null,
      abi: null,
      sizeBytes: null,
      missingComponents: [],
      detail: 'wslcsdk.dll não encontrada (empacotada com o app ou C:\\Program Files\\WSL).'
    }
  }
  const { path: dllPath, source } = found
  try {
    const sdk = loadWslcSdk(dllPath)
    const version = sdk.version()
    const flags = sdk.missingComponents()
    const missing = missingComponentNames(flags)
    return {
      available: true,
      dllPath,
      source,
      wslVersion: `${version.major}.${version.minor}.${version.revision}`,
      abi: sdk.abi.label,
      sizeBytes: fileSize(dllPath),
      missingComponents: missing,
      detail:
        missing.length === 0
          ? 'SDK carregado via FFI (koffi); todos os componentes presentes.'
          : 'SDK carregado, mas há componentes faltando.'
    }
  } catch (e) {
    return {
      available: false,
      dllPath,
      source,
      wslVersion: null,
      abi: null,
      sizeBytes: fileSize(dllPath),
      missingComponents: [],
      detail: `Falha ao carregar/consultar o SDK: ${e instanceof Error ? e.message : hrHex(Number(e))}`
    }
  }
}
