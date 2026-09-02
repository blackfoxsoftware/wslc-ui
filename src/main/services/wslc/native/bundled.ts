import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { probeWslcSdk } from './bindings'

/**
 * Qual wslcsdk.dll empacotada usar — decidido pela versão do WSL instalado.
 *
 * O app leva DUAS DLLs porque o SDK precisa CASAR com o WSL — nas duas
 * direções, e ambas medidas nesta máquina:
 *
 * | | WSL 2.9.4 | WSL 2.9.9 |
 * | SDK 2.9.3 | funciona | `WSLC_E_SDK_UPDATE_NEEDED` já no WslcGetVersion |
 * | SDK 2.9.9 | segfault em WslcGetSessionTerminationEvent | funciona |
 *
 * SDK novo demais é o caso perigoso: nada no header denuncia: a declaração da
 * função que quebra é byte a byte idêntica nas duas versões, e os 18 structs
 * também. Não há binding que se defenda — o processo simplesmente morre. SDK
 * velho demais é o caso educado: o serviço recusa toda chamada com um HRESULT
 * legível.
 *
 * A regra: usa a DLL mais nova que **não passe** da versão do WSL instalado.
 * Com WSL 2.9.4 isso dá a 2.9.3; com 2.9.9 ou mais, a 2.9.9, que traz
 * `WslcOpenContainer` e as assinaturas novas (ver SdkAbi).
 *
 * Quem quiser fugir da regra escolhe a DLL na aba Sistema — e a detecção de
 * ABI cuida do resto.
 */

export interface BundledSdk {
  /** Versão do pacote NuGet Microsoft.WSL.Containers. */
  version: string
  /** Caminho relativo à raiz onde `vendor/` foi instalado. */
  relative: string[]
}

/** Da mais antiga para a mais nova — a ordem que `pickBundledSdk` assume. */
export const BUNDLED_SDKS: BundledSdk[] = [
  { version: '2.9.3', relative: ['vendor', 'wslcsdk', 'win-x64', '2.9.3', 'wslcsdk.dll'] },
  { version: '2.9.9', relative: ['vendor', 'wslcsdk', 'win-x64', '2.9.9', 'wslcsdk.dll'] }
]

/** Compara "2.9.10" com "2.9.9" numericamente, campo a campo. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * A DLL empacotada adequada ao WSL informado.
 *
 * `wslVersion` null (não deu para perguntar) cai na mais antiga: é a que
 * funciona no WSL mínimo suportado, e errar para baixo custa recurso; errar
 * para cima custa o processo.
 */
export function pickBundledSdk(wslVersion: string | null): BundledSdk {
  const primeira = BUNDLED_SDKS[0] as BundledSdk
  if (wslVersion === null) return primeira
  let escolhida = primeira
  for (const sdk of BUNDLED_SDKS) {
    if (compareVersions(sdk.version, wslVersion) <= 0) escolhida = sdk
  }
  return escolhida
}

/** Caminho absoluto de uma DLL empacotada, sob a raiz dada. */
export function bundledPath(sdk: BundledSdk, root: string): string {
  return join(root, ...sdk.relative)
}

/** Memoizado: sondar a DLL custa carregar um binário de 5 MB. */
let detected: string | null | undefined

/**
 * Versão do WSL instalado, perguntada à DLL empacotada mais NOVA que responder.
 *
 * Parece circular — carregar uma DLL para decidir qual DLL usar — mas não é.
 * `WslcGetVersion` devolve a versão do WSL, não a da DLL, não abre sessão e é
 * barato. O detalhe que importa é a ORDEM: da mais nova para a mais antiga.
 *
 * A primeira tentativa foi ao contrário, e a medição derrubou: num WSL 2.9.9, a
 * DLL 2.9.3 recusa até o WslcGetVersion, com WSLC_E_SDK_UPDATE_NEEDED — perguntar
 * à mais velha dava "não sei", caía na mais velha por precaução, e o app inteiro
 * ficava sem motor nativo. A mais nova, ao contrário, responde a versão certa
 * mesmo num WSL antigo (medido: a 2.9.9 respondeu 2.9.4 num WSL 2.9.4); ela só
 * quebra depois, ao mexer na sessão — e é justamente disso que a regra protege.
 */
export function detectWslVersion(
  roots: string[],
  exists: (p: string) => boolean = existsSync
): string | null {
  if (detected !== undefined) return detected
  detected = null
  for (const sdk of BUNDLED_SDKS.toReversed()) {
    for (const root of roots) {
      const path = bundledPath(sdk, root)
      if (!exists(path)) continue
      try {
        const probe = probeWslcSdk(path)
        const v = probe.sdk.version()
        detected = `${v.major}.${v.minor}.${v.revision}`
        probe.unload()
      } catch {
        // Esta DLL não fala com este WSL; tenta a próxima.
      }
      if (detected !== null) return detected
    }
  }
  return detected
}

/** Só para testes: esquece a versão detectada. */
export function resetDetectedWslVersion(): void {
  detected = undefined
}
