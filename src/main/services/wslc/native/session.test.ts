import { afterAll, describe, expect, it } from 'vitest'
import { imageSchema } from '@shared/schemas'
import { locateWslcSdk } from './locate'
import {
  ensureNativeSession,
  isNativeSessionActive,
  listNativeImages,
  releaseNativeSession,
  sessionStoragePath
} from './session'

describe('sessionStoragePath', () => {
  it('usa LOCALAPPDATA quando presente', () => {
    expect(sessionStoragePath({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' })).toBe(
      'C:\\Users\\x\\AppData\\Local\\wslc-ui\\native-session'
    )
  })

  it('cai em USERPROFILE\\AppData\\Local sem LOCALAPPDATA', () => {
    expect(sessionStoragePath({ USERPROFILE: 'C:\\Users\\x' })).toBe(
      'C:\\Users\\x\\AppData\\Local\\wslc-ui\\native-session'
    )
  })
})

// Integração real: roda apenas nas máquinas com a wslcsdk.dll (cria/solta a
// sessão "WslcUi" de verdade — a mesma que o app usa).
describe.skipIf(locateWslcSdk() === null)('sessão nativa (integração real via FFI)', () => {
  afterAll(() => {
    releaseNativeSession()
  })

  it('cria a sessão e lista imagens no shape da UI', { timeout: 30_000 }, async () => {
    await ensureNativeSession()
    expect(isNativeSessionActive()).toBe(true)

    const images = await listNativeImages()
    expect(Array.isArray(images)).toBe(true)
    for (const img of images) {
      expect(() => imageSchema.parse(img)).not.toThrow()
      expect(img.id).toMatch(/^[0-9a-f]{12}$/)
    }
  })
})
