import { describe, expect, it } from 'vitest'
import { pickBundledSdk } from './bundled'
import { locateWslcSdk } from './locate'
import { getNativeStatus, missingComponentNames } from './status'

describe('missingComponentNames', () => {
  it('mapeia os flags para nomes amigáveis', () => {
    expect(missingComponentNames(0)).toEqual([])
    expect(missingComponentNames(1)).toEqual(['Virtual Machine Platform'])
    expect(missingComponentNames(2 | 4)).toEqual(['Pacote WSL (>= 2.9.3)', 'Atualização do SDK'])
  })
})

// Integração real com a wslcsdk.dll — roda apenas onde a DLL existir
// (vendorizada no repo, então normalmente roda).
describe.skipIf(locateWslcSdk() === null)('wslcsdk via FFI (integração)', () => {
  it('carrega a DLL, inicializa COM e lê versão/componentes', () => {
    const status = getNativeStatus()
    expect(status.available).toBe(true)
    // É a versão do WSL instalado, não a da DLL — ver nativeStatusSchema.
    expect(status.wslVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(status.dllPath).toContain('wslcsdk.dll')
    expect(status.sizeBytes).toBeGreaterThan(0)
  })

  // O app leva duas DLLs e escolhe pela versão do WSL (ver bundled.ts). O teste
  // não fixa qual: fixa a REGRA, para valer em qualquer máquina.
  it('usa a DLL empacotada compatível com o WSL desta máquina', () => {
    const status = getNativeStatus()
    const esperada = pickBundledSdk(status.wslVersion)
    expect(status.dllPath).toContain(esperada.version)
    expect(status.abi).toBe(esperada.version === '2.9.9' ? '2.9.9+' : '2.9.3')
  })
})
