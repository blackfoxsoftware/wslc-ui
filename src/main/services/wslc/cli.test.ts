import { describe, expect, it } from 'vitest'
import { decodeOutput, runCommand } from './cli'

describe('decodeOutput', () => {
  it('decodifica UTF-16LE (saída do wsl.exe) removendo NULs', () => {
    const buf = Buffer.from('Versão do WSL: 2.9.3.0', 'utf16le')
    expect(decodeOutput(buf)).toBe('Versão do WSL: 2.9.3.0')
  })

  it('mantém UTF-8 intacto (saída do wslc.exe)', () => {
    const buf = Buffer.from('CONTAINER ID   IMAGE\n', 'utf8')
    expect(decodeOutput(buf)).toBe('CONTAINER ID   IMAGE\n')
  })
})

describe('runCommand', () => {
  it('captura stdout e stderr com código 0', async () => {
    const res = await runCommand(process.execPath, ['-e', "console.log('saida'); console.error('erro')"])
    expect(res.ok).toBe(true)
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('saida')
    expect(res.stderr).toContain('erro')
  })

  it('reporta código de saída em falha', async () => {
    const res = await runCommand(process.execPath, ['-e', 'process.exit(3)'])
    expect(res.ok).toBe(false)
    expect(res.code).toBe(3)
  })

  it('binário inexistente retorna erro em vez de lançar', async () => {
    const res = await runCommand('nao-existe-com-certeza.exe', ['x'])
    expect(res.ok).toBe(false)
    expect(res.stderr.length).toBeGreaterThan(0)
  })
})
