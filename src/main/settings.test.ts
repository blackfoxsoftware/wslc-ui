import { describe, expect, it } from 'vitest'
import {
  readEngineSetting,
  readNativeTuning,
  settingsFilePath,
  writeEngineSetting,
  writeNativeTuning,
  type SettingsIo
} from './settings'

function memoryIo(initial: Record<string, string> = {}): SettingsIo & { files: Record<string, string> } {
  const files = { ...initial }
  return {
    files,
    read: (file) => {
      if (!(file in files)) throw new Error('ENOENT')
      return files[file]
    },
    write: (file, data) => {
      files[file] = data
    }
  }
}

describe('settingsFilePath', () => {
  it('aponta para settings.json dentro do userData', () => {
    expect(settingsFilePath('C:\\dados')).toMatch(/settings\.json$/)
  })
})

describe('readEngineSetting', () => {
  it('lê o motor persistido', () => {
    const io = memoryIo({ 'settings.json': JSON.stringify({ engine: 'native' }) })
    expect(readEngineSetting('settings.json', io)).toBe('native')
  })

  it('cai em cli quando o arquivo não existe', () => {
    expect(readEngineSetting('settings.json', memoryIo())).toBe('cli')
  })

  it('cai em cli com JSON inválido ou valor desconhecido', () => {
    expect(readEngineSetting('settings.json', memoryIo({ 'settings.json': '{podre' }))).toBe('cli')
    expect(
      readEngineSetting('settings.json', memoryIo({ 'settings.json': JSON.stringify({ engine: 'turbo' }) }))
    ).toBe('cli')
  })
})

describe('writeEngineSetting', () => {
  it('grava o motor', () => {
    const io = memoryIo()
    writeEngineSetting('settings.json', 'native', io)
    expect(JSON.parse(io.files['settings.json'])).toEqual({ engine: 'native' })
  })

  it('preserva outras chaves já existentes', () => {
    const io = memoryIo({ 'settings.json': JSON.stringify({ tema: 'dark', engine: 'cli' }) })
    writeEngineSetting('settings.json', 'native', io)
    expect(JSON.parse(io.files['settings.json'])).toEqual({ tema: 'dark', engine: 'native' })
  })
})

describe('native tuning (persistência)', () => {
  it('lê o tuning salvo e cai em {} quando ausente/inválido', () => {
    const io = memoryIo({
      'settings.json': JSON.stringify({ engine: 'cli', nativeTuning: { cpuCount: 2, gpu: true } })
    })
    expect(readNativeTuning('settings.json', io)).toEqual({ cpuCount: 2, gpu: true })
    expect(readNativeTuning('settings.json', memoryIo())).toEqual({})
    expect(
      readNativeTuning(
        'settings.json',
        memoryIo({ 'settings.json': JSON.stringify({ nativeTuning: { cpuCount: -1 } }) })
      )
    ).toEqual({})
  })

  it('grava o tuning preservando o motor', () => {
    const io = memoryIo({ 'settings.json': JSON.stringify({ engine: 'native' }) })
    writeNativeTuning('settings.json', { memoryMb: 2048, vhdSizeMb: 10_240 }, io)
    expect(JSON.parse(io.files['settings.json'])).toEqual({
      engine: 'native',
      nativeTuning: { memoryMb: 2048, vhdSizeMb: 10_240 }
    })
    // e o writeEngineSetting não apaga o tuning
    writeEngineSetting('settings.json', 'cli', io)
    expect(JSON.parse(io.files['settings.json'])).toEqual({
      engine: 'cli',
      nativeTuning: { memoryMb: 2048, vhdSizeMb: 10_240 }
    })
  })
})
