import { describe, expect, it } from 'vitest'
import { locateWslcSdk, sdkCandidates } from './locate'

const ENV = { ProgramFiles: 'C:\\Program Files' } as NodeJS.ProcessEnv

describe('sdkCandidates', () => {
  it('prioriza o override, depois a DLL vendorizada, depois o Program Files', () => {
    const candidates = sdkCandidates({ ...ENV, WSLC_SDK_DLL: 'D:\\custom\\wslcsdk.dll' }, 'C:\\app')
    expect(candidates).toEqual([
      'D:\\custom\\wslcsdk.dll',
      'C:\\app\\vendor\\wslcsdk\\win-x64\\wslcsdk.dll',
      'C:\\Program Files\\WSL\\wslcsdk.dll'
    ])
  })
})

describe('locateWslcSdk', () => {
  it('retorna o primeiro candidato existente', () => {
    const found = locateWslcSdk(ENV, 'C:\\app', (p) => p.includes('Program Files'))
    expect(found).toBe('C:\\Program Files\\WSL\\wslcsdk.dll')
  })

  it('retorna null quando nada existe', () => {
    expect(locateWslcSdk(ENV, 'C:\\app', () => false)).toBeNull()
  })
})
