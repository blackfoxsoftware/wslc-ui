import type { NativeStatus } from '@shared/schemas'
import { hrHex, loadWslcSdk, WSLC_COMPONENT_FLAGS } from './bindings'
import { locateWslcSdk } from './locate'

/** Nomes amigáveis dos componentes que podem faltar. */
export function missingComponentNames(flags: number): string[] {
  const names: string[] = []
  if (flags & WSLC_COMPONENT_FLAGS.VIRTUAL_MACHINE_PLATFORM) names.push('Virtual Machine Platform')
  if (flags & WSLC_COMPONENT_FLAGS.WSL_PACKAGE) names.push('Pacote WSL (>= 2.9.3)')
  if (flags & WSLC_COMPONENT_FLAGS.SDK_NEEDS_UPDATE) names.push('Atualização do SDK')
  return names
}

/** Sonda a API nativa (wslcsdk.dll): presença, versão do SDK e componentes. */
export function getNativeStatus(): NativeStatus {
  const dllPath = locateWslcSdk()
  if (!dllPath) {
    return {
      available: false,
      dllPath: null,
      sdkVersion: null,
      missingComponents: [],
      detail: 'wslcsdk.dll não encontrada (vendor/wslcsdk ou C:\\Program Files\\WSL).'
    }
  }
  try {
    const sdk = loadWslcSdk(dllPath)
    const version = sdk.version()
    const flags = sdk.missingComponents()
    const missing = missingComponentNames(flags)
    return {
      available: true,
      dllPath,
      sdkVersion: `${version.major}.${version.minor}.${version.revision}`,
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
      sdkVersion: null,
      missingComponents: [],
      detail: `Falha ao carregar/consultar o SDK: ${e instanceof Error ? e.message : hrHex(Number(e))}`
    }
  }
}
