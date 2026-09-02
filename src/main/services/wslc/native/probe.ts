import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import type { SdkProbe } from '@shared/schemas'
import { HR_SDK_UPDATE_NEEDED, probeWslcSdk } from './bindings'
import { missingComponentNames } from './status'

/**
 * Sonda uma wslcsdk.dll escolhida pela pessoa, antes de o app adotá-la.
 *
 * Existe porque a versão da DLL decide se o motor nativo funciona — e nem o
 * SDK nem o arquivo dizem qual versão são: `WslcGetVersion` devolve a versão
 * do WSL instalado (o mesmo número para binários diferentes) e a DLL não traz
 * metadados. Então a sonda mede o que dá: o SHA-256 identifica o binário, e a
 * ABI sai da presença do símbolo `WslcOpenContainer` (ver SdkAbi).
 *
 * Carregar uma DLL arbitrária é a parte arriscada, e por isso tudo aqui está
 * sob try: arquivo que não é DLL, DLL que não é a wslcsdk, ou uma wslcsdk de
 * uma versão que não exporta o que esperamos — os três viram `ok: false` com
 * o motivo, nunca uma exceção subindo para o IPC.
 */
const noop = (): void => undefined

export function probeSdkFile(path: string): SdkProbe {
  const base: SdkProbe = {
    path,
    ok: false,
    wslVersion: null,
    abi: null,
    sizeBytes: null,
    sha256: null,
    missingComponents: [],
    detail: ''
  }

  let sizeBytes: number | null = null
  let sha256: string | null = null
  try {
    sizeBytes = statSync(path).size
    sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch (e) {
    return { ...base, detail: `Não consegui ler o arquivo: ${(e as Error).message}` }
  }

  let unload = noop
  try {
    const probe = probeWslcSdk(path)
    unload = probe.unload
    const version = probe.sdk.version()
    const missing = missingComponentNames(probe.sdk.missingComponents())
    return {
      path,
      ok: true,
      wslVersion: `${version.major}.${version.minor}.${version.revision}`,
      abi: probe.sdk.abi.label,
      sizeBytes,
      sha256,
      missingComponents: missing,
      detail:
        missing.length === 0
          ? `DLL válida, ABI ${probe.sdk.abi.label}.`
          : `DLL válida (ABI ${probe.sdk.abi.label}), mas há componentes faltando.`
    }
  } catch (e) {
    return {
      ...base,
      sizeBytes,
      sha256,
      detail: (e instanceof Error ? e.message : String(e)).includes(HR_SDK_UPDATE_NEEDED)
        ? 'Esta DLL é antiga demais para o WSL instalado (WSLC_E_SDK_UPDATE_NEEDED).'
        : `Não é uma wslcsdk.dll utilizável: ${e instanceof Error ? e.message : String(e)}`
    }
  } finally {
    // Não deixa a candidata carregada no processo; a em uso é preservada
    // pelo próprio unload (ver probeWslcSdk).
    try {
      unload()
    } catch {
      // descarregar é melhor-esforço: falhar aqui não invalida a sonda
    }
  }
}
