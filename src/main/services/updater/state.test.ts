import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/schemas'
import { applyEvent, detectMode, GITHUB_OWNER, GITHUB_REPO, initialStatus, releasePageUrl } from './state'

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  ...initialStatus('0.2.0', 'installer'),
  ...over
})

describe('detectMode', () => {
  it('rodando do código-fonte não tem o que atualizar', () => {
    expect(detectMode(false, {})).toBe('disabled')
    // Nem mesmo com a variável do portátil presente: sem empacotar, não há app.
    expect(detectMode(false, { PORTABLE_EXECUTABLE_DIR: 'C:/tmp' })).toBe('disabled')
  })

  it('PORTABLE_EXECUTABLE_DIR marca o .exe portátil', () => {
    expect(detectMode(true, { PORTABLE_EXECUTABLE_DIR: 'C:/Users/x/Downloads' })).toBe('portable')
  })

  it('empacotado sem a variável é uma instalação', () => {
    expect(detectMode(true, {})).toBe('installer')
  })
})

describe('initialStatus', () => {
  it('explica por que está desligado quando está', () => {
    expect(initialStatus('0.2.0', 'disabled').reason).toMatch(/código-fonte/)
    expect(initialStatus('0.2.0', 'portable').reason).toMatch(/portátil/)
    expect(initialStatus('0.2.0', 'installer').reason).toBeNull()
  })
})

describe('applyEvent', () => {
  it('sem updater, evento nenhum mexe no estado', () => {
    const inicial = status({ mode: 'disabled' })
    expect(applyEvent(inicial, { type: 'available', version: '9.9.9', notes: null, at: 1 })).toBe(inicial)
    expect(applyEvent(inicial, { type: 'downloaded', version: '9.9.9' })).toBe(inicial)
  })

  it('checar limpa o erro anterior', () => {
    const depois = applyEvent(status({ state: 'error', error: 'rede caiu' }), { type: 'checking' })
    expect(depois.state).toBe('checking')
    expect(depois.error).toBeNull()
  })

  it('não recheca o que já foi baixado', () => {
    const baixada = status({ state: 'downloaded', newVersion: '0.3.0', percent: 100 })
    expect(applyEvent(baixada, { type: 'checking' })).toBe(baixada)
  })

  it('em dia apaga a versão nova de uma checagem anterior', () => {
    const antes = status({ state: 'available', newVersion: '0.3.0', releaseNotes: 'nota' })
    const depois = applyEvent(antes, { type: 'up-to-date', at: 1_700_000_000_000 })
    expect(depois).toMatchObject({
      state: 'up-to-date',
      newVersion: null,
      releaseNotes: null,
      releaseUrl: null,
      checkedAt: 1_700_000_000_000
    })
  })

  it('achar uma versão traz notas e o endereço da release', () => {
    const depois = applyEvent(status(), {
      type: 'available',
      version: '0.3.0',
      notes: '### Corrigido',
      at: 42
    })
    expect(depois).toMatchObject({
      state: 'available',
      newVersion: '0.3.0',
      releaseNotes: '### Corrigido',
      releaseUrl: releasePageUrl('0.3.0'),
      checkedAt: 42
    })
  })

  it('progresso vira percentual inteiro entre 0 e 100', () => {
    expect(applyEvent(status(), { type: 'progress', percent: 33.7 }).percent).toBe(34)
    expect(applyEvent(status(), { type: 'progress', percent: -5 }).percent).toBe(0)
    expect(applyEvent(status(), { type: 'progress', percent: 150 }).percent).toBe(100)
    expect(applyEvent(status(), { type: 'progress', percent: 10 }).state).toBe('downloading')
  })

  it('progresso atrasado não desfaz um download concluído', () => {
    const baixada = status({ state: 'downloaded', percent: 100 })
    expect(applyEvent(baixada, { type: 'progress', percent: 60 })).toBe(baixada)
  })

  it('falhar no download preserva a versão, para poder oferecer a release', () => {
    const baixando = status({ state: 'downloading', newVersion: '0.3.0', percent: 40 })
    const depois = applyEvent(baixando, { type: 'error', message: 'conexão perdida' })
    expect(depois).toMatchObject({ state: 'error', newVersion: '0.3.0', error: 'conexão perdida' })
    expect(depois.releaseUrl).toBe(baixando.releaseUrl)
  })

  // O caso que mais importa: o arquivo já está no disco e vai ser instalado ao
  // fechar o app. Uma falha DEPOIS disso (a checagem seguinte, por exemplo) não
  // pode fazer a UI dizer que não há atualização nenhuma.
  it('erro depois de baixada não apaga a atualização pronta', () => {
    const baixada = status({ state: 'downloaded', newVersion: '0.3.0', percent: 100 })
    const depois = applyEvent(baixada, { type: 'error', message: 'GitHub fora do ar' })
    expect(depois.state).toBe('downloaded')
    expect(depois.percent).toBe(100)
    expect(depois.error).toBe('GitHub fora do ar')
  })
})

describe('releasePageUrl', () => {
  it('aponta para a tag que o workflow cria', () => {
    expect(releasePageUrl('0.3.0')).toBe('https://github.com/blackfoxsoftware/wslc-ui/releases/tag/v0.3.0')
  })

  // O updater procura a versão nova pelo publish do electron-builder; o link
  // "baixar na release" é montado aqui. Se os dois apontarem para repositórios
  // diferentes, o app avisa de uma versão e manda buscar em outro lugar.
  it('usa o mesmo repositório que o publish do electron-builder', () => {
    const yml = readFileSync('electron-builder.yml', 'utf8')
    expect(yml).toContain(`owner: ${GITHUB_OWNER}`)
    expect(yml).toContain(`repo: ${GITHUB_REPO}`)
  })
})
