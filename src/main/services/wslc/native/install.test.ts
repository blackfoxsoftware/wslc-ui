import { describe, expect, it } from 'vitest'
import type { InstallProgressEvent } from '@shared/schemas'
import { componentLabel, installNativeComponents } from './install'
import { locateWslcSdk } from './locate'

describe('componentLabel (puro)', () => {
  it('nomeia os componentes conhecidos', () => {
    expect(componentLabel(1)).toBe('Virtual Machine Platform')
    expect(componentLabel(2)).toBe('Pacote WSL')
    expect(componentLabel(4)).toBe('Atualização do SDK')
  })

  it('flag desconhecida vira "componente N"', () => {
    expect(componentLabel(64)).toBe('componente 64')
  })
})

// Integração real: nesta máquina (completa) a instalação guiada é um no-op
// idempotente — S_OK sem nenhum callback de progresso (validado por probe).
describe.skipIf(locateWslcSdk() === null)('instalação guiada (integração real via FFI)', () => {
  it('é idempotente em máquina completa (ok, sem progresso)', { timeout: 60_000 }, async () => {
    const events: InstallProgressEvent[] = []
    const res = await installNativeComponents((ev) => events.push(ev))
    expect(res.ok, res.stderr).toBe(true)
    expect(res.stdout).toContain('já estavam instalados')
    expect(events).toEqual([])
  })
})
