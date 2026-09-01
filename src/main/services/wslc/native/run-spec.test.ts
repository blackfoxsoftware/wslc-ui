import { describe, expect, it } from 'vitest'
import { formatPortsDisplay, mapNativeState, parsePortSpec, parseVolumeSpec } from './run-spec'

describe('parsePortSpec', () => {
  it('aceita hostPort:containerPort e /tcp explícito', () => {
    expect(parsePortSpec('8080:80')).toEqual({ windowsPort: 8080, containerPort: 80, protocol: 0 })
    expect(parsePortSpec(' 5432:5432/tcp ')).toEqual({
      windowsPort: 5432,
      containerPort: 5432,
      protocol: 0
    })
  })

  it('rejeita UDP com mensagem clara (E_NOTIMPL no SDK preview)', () => {
    expect(() => parsePortSpec('53:53/udp')).toThrow(/UDP/)
  })

  it('rejeita formatos inválidos e portas fora do intervalo', () => {
    expect(() => parsePortSpec('8080')).toThrow(/inválida/)
    expect(() => parsePortSpec('abc:80')).toThrow(/inválida/)
    expect(() => parsePortSpec('0:80')).toThrow(/intervalo/)
    expect(() => parsePortSpec('99999:80')).toThrow(/inválida|intervalo/)
  })
})

describe('parseVolumeSpec', () => {
  it('bind com caminho do Windows (a letra de unidade não vira separador)', () => {
    expect(parseVolumeSpec('C:\\dados:/data')).toEqual({
      kind: 'bind',
      windowsPath: 'C:\\dados',
      containerPath: '/data',
      readOnly: false
    })
  })

  it('bind somente leitura (:ro) e caminho UNC', () => {
    expect(parseVolumeSpec('D:/projetos/app:/app:ro')).toEqual({
      kind: 'bind',
      windowsPath: 'D:/projetos/app',
      containerPath: '/app',
      readOnly: true
    })
    expect(parseVolumeSpec('\\\\servidor\\share:/mnt')).toMatchObject({ kind: 'bind' })
  })

  it('volume nomeado', () => {
    expect(parseVolumeSpec('meuvol:/var/lib/postgresql/data')).toEqual({
      kind: 'named',
      name: 'meuvol',
      containerPath: '/var/lib/postgresql/data',
      readOnly: false
    })
  })

  it('rejeita specs inválidas', () => {
    expect(() => parseVolumeSpec('semdestino')).toThrow(/inválido/)
    expect(() => parseVolumeSpec('meu vol:/data')).toThrow(/inválido/)
  })
})

describe('mapNativeState', () => {
  it('mapeia os estados do SDK para a UI', () => {
    expect(mapNativeState(1, null)).toEqual({ state: 'created', status: 'Criado' })
    expect(mapNativeState(2, null)).toEqual({ state: 'running', status: 'Em execução' })
    expect(mapNativeState(3, 7)).toEqual({ state: 'exited', status: 'Encerrado (código 7)' })
    expect(mapNativeState(3, null)).toEqual({ state: 'exited', status: 'Encerrado' })
    expect(mapNativeState(0, null).state).toBe('unknown')
  })
})

describe('formatPortsDisplay', () => {
  it('formata no estilo docker', () => {
    expect(
      formatPortsDisplay([
        { windowsPort: 18080, containerPort: 80, protocol: 0 },
        { windowsPort: 5432, containerPort: 5432, protocol: 0 }
      ])
    ).toBe('18080->80/tcp, 5432->5432/tcp')
    expect(formatPortsDisplay([])).toBe('')
  })
})
