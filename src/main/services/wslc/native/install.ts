import type { CommandResult, InstallProgressEvent } from '@shared/schemas'
import { logError, logInfo } from '../../logger'
import {
  hrText,
  hrOk,
  loadWslcSdk,
  registerCallback,
  unregisterCallback,
  WSLC_COMPONENT_FLAGS,
  WSLC_INSTALL_OPTIONS
} from './bindings'
import { locateWslcSdk } from './locate'
import { callNative } from './session'
import { missingComponentNames } from './status'

/**
 * Instalação guiada (Fase 6): WslcInstallWithDependencies instala o que
 * estiver faltando (Virtual Machine Platform, pacote WSL) com progresso por
 * componente. Não precisa de sessão — só da DLL vendorada, que é exatamente
 * o cenário do SetupView (máquina sem WSL/wslc prontos).
 *
 * Por probe: em máquina completa é um no-op idempotente (S_OK em ~2ms, zero
 * callbacks) — seguro chamar sempre.
 */

/** Nome amigável do componente informado pelo callback de instalação. */
export function componentLabel(flag: number): string {
  if (flag & WSLC_COMPONENT_FLAGS.VIRTUAL_MACHINE_PLATFORM) return 'Virtual Machine Platform'
  if (flag & WSLC_COMPONENT_FLAGS.WSL_PACKAGE) return 'Pacote WSL'
  if (flag & WSLC_COMPONENT_FLAGS.SDK_NEEDS_UPDATE) return 'Atualização do SDK'
  return `componente ${flag}`
}

export async function installNativeComponents(
  onProgress: (ev: InstallProgressEvent) => void
): Promise<CommandResult> {
  const dllPath = locateWslcSdk()
  if (!dllPath) {
    return {
      ok: false,
      code: 1,
      stdout: '',
      stderr: 'wslcsdk.dll não encontrada — instalação guiada indisponível nesta máquina.'
    }
  }

  let cbId: bigint | null = null
  try {
    const sdk = loadWslcSdk(dllPath)
    const before = sdk.missingComponents()
    const missing = missingComponentNames(before)
    logInfo(
      'native',
      missing.length > 0
        ? `Instalação guiada iniciada — faltando: ${missing.join(', ')}`
        : 'Instalação guiada: nenhum componente faltando (verificação idempotente)'
    )

    const cb = (component: number, step: number, total: number): void => {
      onProgress({ component: componentLabel(component), step, total })
    }
    cbId = registerCallback(cb as never, sdk.types['InstallCallback'])
    // A ABI 2.9.9 pede quais componentes instalar (e opções) antes do callback.
    // `before` são justamente os que faltam — com 0, a chamada vira no-op, que
    // é o mesmo comportamento idempotente da 2.9.3 em máquina completa.
    const hr = sdk.abi.modern
      ? await callNative(
          sdk.raw['WslcInstallWithDependencies'],
          before,
          WSLC_INSTALL_OPTIONS.NONE,
          cbId,
          null
        )
      : await callNative(sdk.raw['WslcInstallWithDependencies'], cbId, null)

    if (!hrOk(hr)) {
      const message =
        `WslcInstallWithDependencies falhou: ${hrText(hr)} — a instalação pode exigir ` +
        'privilégios de administrador. Alternativa manual: wsl --update --pre-release'
      logError('native', 'Instalação guiada falhou', message)
      return { ok: false, code: 1, stdout: '', stderr: message }
    }

    const lines =
      missing.length > 0
        ? [`Instalação concluída: ${missing.join(', ')}.`]
        : ['Todos os componentes já estavam instalados.']
    if (before & WSLC_COMPONENT_FLAGS.VIRTUAL_MACHINE_PLATFORM) {
      lines.push('A Virtual Machine Platform exige reinicializar o Windows para concluir.')
    }
    logInfo('native', lines.join(' '))
    return { ok: true, code: 0, stdout: lines.join('\n'), stderr: '' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logError('native', 'Instalação guiada falhou', message)
    return { ok: false, code: 1, stdout: '', stderr: message }
  } finally {
    // Margem para callbacks ainda enfileirados no loop antes do unregister.
    const id = cbId
    if (id !== null) {
      setImmediate(() => {
        try {
          unregisterCallback(id)
        } catch {
          // já removido
        }
      })
    }
  }
}
