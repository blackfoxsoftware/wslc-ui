import { describe, expect, it } from 'vitest'
import { buildBuildArgs, buildLogsArgs } from './stream-args'

/**
 * Os argumentos dos comandos longos da CLI. Conferidos contra o `--help` da
 * wslc 2.9.9 — em especial o `-n` do tail (o docker usa `--tail`) e o `-o` do
 * build, que ali é `--output` e não `--opt`.
 */
describe('buildBuildArgs', () => {
  it('o mínimo: tag e contexto, com o contexto por último', () => {
    expect(buildBuildArgs({ tag: 'app:1', context: 'C:\\projeto' })).toEqual([
      'image',
      'build',
      '-t',
      'app:1',
      'C:\\projeto'
    ])
  })

  it('cobre todas as opções do build', () => {
    expect(
      buildBuildArgs({
        tag: 'app:1',
        context: 'C:\\projeto',
        file: 'Dockerfile.prod',
        buildArgs: ['VERSION=1.2.0', 'NODE_ENV=production', '  '],
        secrets: ['id=npmrc,src=C:\\.npmrc'],
        labels: ['app=site'],
        target: 'builder',
        output: 'type=local,dest=C:\\saida',
        iidfile: 'C:\\build\\id.txt',
        progress: 'plain',
        noCache: true,
        pull: true
      })
    ).toEqual([
      'image',
      'build',
      '-t',
      'app:1',
      '-f',
      'Dockerfile.prod',
      '--build-arg',
      'VERSION=1.2.0',
      '--build-arg',
      'NODE_ENV=production',
      '--secret',
      'id=npmrc,src=C:\\.npmrc',
      '-l',
      'app=site',
      '--target',
      'builder',
      '-o',
      'type=local,dest=C:\\saida',
      '--iidfile',
      'C:\\build\\id.txt',
      '--progress',
      'plain',
      '--no-cache',
      '--pull',
      'C:\\projeto'
    ])
  })

  it('progress "auto" não vai para a linha de comando (já é o padrão)', () => {
    expect(buildBuildArgs({ tag: 'a:1', context: '.', progress: 'auto' })).not.toContain('--progress')
  })
})

describe('buildLogsArgs', () => {
  it('sem opções: só o comando e o container (a CLI despeja o log inteiro)', () => {
    expect(buildLogsArgs('web')).toEqual(['container', 'logs', 'web'])
  })

  it('a cauda usa -n, não --tail (a wslc difere do docker aqui)', () => {
    expect(buildLogsArgs('web', { follow: true, tail: 500 })).toEqual([
      'container',
      'logs',
      '--follow',
      '-n',
      '500',
      'web'
    ])
  })

  it('carimbo de hora e recorte por data', () => {
    expect(
      buildLogsArgs('web', {
        timestamps: true,
        since: '2026-09-01T10:30:00Z',
        until: '1756800000'
      })
    ).toEqual(['container', 'logs', '-t', '--since', '2026-09-01T10:30:00Z', '--until', '1756800000', 'web'])
  })
})
