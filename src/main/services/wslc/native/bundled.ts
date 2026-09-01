import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { probeWslcSdk } from './bindings'

/**
 * Qual wslcsdk.dll empacotada usar — decidido pela versão do WSL instalado.
 *
 * O app leva DUAS DLLs porque a versão do SDK precisa acompanhar a do WSL, e
 * isso foi medido, não suposto: com WSL 2.9.4, o SDK 2.9.9 cria a sessão,
 * lista imagens… e então dá **segmentation fault** em
 * `WslcGetSessionTerminationEvent`. A declaração dessa função é byte a byte
 * idêntica nas duas versões, e os 18 structs também — ou seja, não há como o
 * app se defender por binding. O SDK novo simplesmente conversa com um
 * wslservice mais velho do que ele espera, e o processo morre.
 *
 * A regra, então, é conservadora: usa a DLL mais nova que **não passe** da
 * versão do WSL instalado. Com WSL 2.9.4 isso dá a 2.9.3; com WSL 2.9.9 ou
 * mais, a 2.9.9, que traz `WslcOpenContainer` e as assinaturas novas (ver
 * SdkAbi).
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
 * Versão do WSL instalado, perguntada à DLL empacotada mais ANTIGA.
 *
 * Parece circular — carregar uma DLL para decidir qual DLL usar — mas não é: a
 * mais antiga é justamente a que funciona em qualquer WSL suportado, e
 * `WslcGetVersion` responde a versão do WSL, não a dela própria. É uma chamada
 * barata, sem sessão, e é o único jeito de saber a versão sem depender do
 * `wsl.exe` estar no PATH.
 */
export function detectWslVersion(
  roots: string[],
  exists: (p: string) => boolean = existsSync
): string | null {
  if (detected !== undefined) return detected
  detected = null
  const base = BUNDLED_SDKS[0] as BundledSdk
  for (const root of roots) {
    const path = bundledPath(base, root)
    if (!exists(path)) continue
    try {
      const probe = probeWslcSdk(path)
      const v = probe.sdk.version()
      detected = `${v.major}.${v.minor}.${v.revision}`
      probe.unload()
    } catch {
      // DLL base ausente ou ilegível: segue com null (cai na mais antiga).
    }
    break
  }
  return detected
}

/** Só para testes: esquece a versão detectada. */
export function resetDetectedWslVersion(): void {
  detected = undefined
}
