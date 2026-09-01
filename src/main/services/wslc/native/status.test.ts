import { describe, expect, it } from 'vitest'
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
    expect(status.sdkVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(status.dllPath).toContain('wslcsdk.dll')
  })
})
