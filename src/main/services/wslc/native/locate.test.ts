import { afterEach, describe, expect, it } from 'vitest'
import { locateSdk, locateWslcSdk, sdkCandidates, setCustomSdkPath } from './locate'

const ENV = { ProgramFiles: 'C:\\Program Files' } as NodeJS.ProcessEnv
const BASE = { env: ENV, appRoot: 'C:\\app', resourcesRoot: null }

afterEach(() => {
  setCustomSdkPath(null)
})

describe('sdkCandidates', () => {
  it('ordena: override, escolha da pessoa, empacotada, Program Files', () => {
    const candidates = sdkCandidates({
      ...BASE,
      env: { ...ENV, WSLC_SDK_DLL: 'D:\\dev\\wslcsdk.dll' },
      custom: 'E:\\baixada\\wslcsdk.dll'
    })
    expect(candidates).toEqual([
      { path: 'D:\\dev\\wslcsdk.dll', source: 'env' },
      { path: 'E:\\baixada\\wslcsdk.dll', source: 'custom' },
      { path: 'C:\\app\\vendor\\wslcsdk\\win-x64\\2.9.3\\wslcsdk.dll', source: 'bundled' },
      { path: 'C:\\Program Files\\WSL\\wslcsdk.dll', source: 'system' }
    ])
  })

  // No app instalado a DLL vai como extraResource, fora do asar.
  it('procura em resources antes do diretório do projeto', () => {
    const paths = sdkCandidates({ ...BASE, resourcesRoot: 'C:\\Program Files\\WSLC UI\\resources' })
    expect(paths.map((c) => c.path)).toEqual([
      'C:\\Program Files\\WSLC UI\\resources\\vendor\\wslcsdk\\win-x64\\2.9.3\\wslcsdk.dll',
      'C:\\app\\vendor\\wslcsdk\\win-x64\\2.9.3\\wslcsdk.dll',
      'C:\\Program Files\\WSL\\wslcsdk.dll'
    ])
  })

  it('usa o caminho escolhido guardado no módulo quando nenhum é passado', () => {
    setCustomSdkPath('E:\\escolhida\\wslcsdk.dll')
    expect(sdkCandidates(BASE)[0]).toEqual({ path: 'E:\\escolhida\\wslcsdk.dll', source: 'custom' })
  })
})

describe('locateSdk', () => {
  it('devolve o primeiro que existe, com a origem', () => {
    const found = locateSdk({ ...BASE, exists: (p) => p.includes('Program Files') })
    expect(found).toEqual({ path: 'C:\\Program Files\\WSL\\wslcsdk.dll', source: 'system' })
  })

  it('devolve null quando nada existe', () => {
    expect(locateSdk({ ...BASE, exists: () => false })).toBeNull()
    expect(locateWslcSdk({ ...BASE, exists: () => false })).toBeNull()
  })

  // A escolha da pessoa pode apontar para um arquivo que sumiu: cai para a
  // empacotada em vez de deixar o motor nativo indisponível.
  it('ignora a escolha que não existe mais e cai para a empacotada', () => {
    setCustomSdkPath('E:\\sumiu\\wslcsdk.dll')
    const found = locateSdk({ ...BASE, exists: (p) => p.startsWith('C:\\app') })
    expect(found).toEqual({
      path: 'C:\\app\\vendor\\wslcsdk\\win-x64\\2.9.3\\wslcsdk.dll',
      source: 'bundled'
    })
  })
})

describe('escolha da DLL empacotada', () => {
  it('acompanha a versão do WSL informada', () => {
    const nova = sdkCandidates({ ...BASE, wslVersion: '2.9.9' })
    expect(nova.find((c) => c.source === 'bundled')?.path).toContain('2.9.9')
    const antiga = sdkCandidates({ ...BASE, wslVersion: '2.9.4' })
    expect(antiga.find((c) => c.source === 'bundled')?.path).toContain('2.9.3')
  })
})
