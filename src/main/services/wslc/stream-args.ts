import type { BuildImageOptions, ContainerLogsOptions } from '@shared/schemas'
import { pushEach, pushOpt } from './args'

/**
 * Argumentos dos comandos de longa duração da CLI (build e logs).
 *
 * Ficam fora de `real.ts` porque quem os monta é a camada IPC — que não pode
 * depender do motor real, senão o modo de demonstração carregaria o wslc.exe.
 * `StreamOps` recebe a lista pronta e só faz o spawn.
 */

/**
 * `wslc image build`. A pasta de contexto é o último argumento (posicional),
 * como no docker; o resto vem antes em qualquer ordem.
 */
export function buildBuildArgs(opts: BuildImageOptions): string[] {
  const args = ['image', 'build', '-t', opts.tag.trim()]
  pushOpt(args, '-f', opts.file)
  pushEach(args, '--build-arg', opts.buildArgs)
  pushEach(args, '--secret', opts.secrets)
  pushEach(args, '-l', opts.labels)
  pushOpt(args, '--target', opts.target)
  pushOpt(args, '-o', opts.output)
  pushOpt(args, '--iidfile', opts.iidfile)
  // 'auto' é o padrão da CLI: passar não muda nada e só polui o log.
  if (opts.progress && opts.progress !== 'auto') args.push('--progress', opts.progress)
  if (opts.noCache) args.push('--no-cache')
  if (opts.pull) args.push('--pull')
  args.push(opts.context.trim())
  return args
}

/**
 * `wslc container logs`. Sem `--tail` a CLI despeja o log inteiro desde o
 * primeiro byte; quem chama decide a cauda (a UI abre com uma).
 */
export function buildLogsArgs(id: string, opts?: ContainerLogsOptions): string[] {
  const args = ['container', 'logs']
  if (opts?.follow) args.push('--follow')
  if (opts?.tail !== undefined) args.push('-n', String(opts.tail))
  if (opts?.timestamps) args.push('-t')
  pushOpt(args, '--since', opts?.since)
  pushOpt(args, '--until', opts?.until)
  args.push(id)
  return args
}
