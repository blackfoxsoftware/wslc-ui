import type { RunContainerOptions } from '@shared/schemas'
import { pushEach, pushOpt } from './args'

/** Divide um comando respeitando aspas simples/duplas. */
export function splitCommand(command: string): string[] {
  const parts: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command)) !== null) {
    parts.push(m[1] ?? m[2] ?? m[3])
  }
  return parts
}

/** Monta a linha de argumentos de `wslc run` a partir das opções do diálogo. */
export function buildRunArgs(opts: RunContainerOptions): string[] {
  // `container create` cria parado: não aceita -d (não há o que desanexar).
  const args = opts.createOnly ? ['container', 'create'] : ['run']
  if (opts.detach && !opts.createOnly) args.push('-d')
  if (opts.rm) args.push('--rm')
  pushOpt(args, '--name', opts.name)
  pushEach(args, '-p', opts.ports)
  if (opts.publishAll) args.push('-P')
  pushEach(args, '-e', opts.env)
  pushOpt(args, '--env-file', opts.envFile)
  pushEach(args, '-v', opts.volumes)
  pushEach(args, '--tmpfs', opts.tmpfs)
  if (opts.gpus) args.push('--gpus', 'all')
  pushOpt(args, '--hostname', opts.hostname)
  pushOpt(args, '--domainname', opts.domainname)
  pushOpt(args, '--workdir', opts.workdir)
  pushOpt(args, '--user', opts.user)
  pushOpt(args, '--entrypoint', opts.entrypoint)
  pushOpt(args, '--network', opts.network)
  pushEach(args, '--network-alias', opts.networkAliases)
  pushOpt(args, '--ip', opts.ip)
  pushEach(args, '--mount', opts.mounts)
  // 'missing' é o padrão da CLI — só vale passar quando muda o comportamento.
  if (opts.pull && opts.pull !== 'missing') args.push('--pull', opts.pull)
  pushEach(args, '--dns', opts.dns)
  pushEach(args, '--dns-search', opts.dnsSearch)
  pushEach(args, '--dns-option', opts.dnsOptions)
  pushEach(args, '-l', opts.labels)
  pushOpt(args, '--cpus', opts.cpus)
  pushOpt(args, '--memory', opts.memory)
  pushOpt(args, '--shm-size', opts.shmSize)
  pushEach(args, '--ulimit', opts.ulimits)
  pushOpt(args, '--stop-signal', opts.stopSignal)
  if (opts.stopTimeout !== undefined) args.push('--stop-timeout', String(opts.stopTimeout))
  if (opts.health?.disable) args.push('--no-healthcheck')
  else if (opts.health) {
    pushOpt(args, '--health-cmd', opts.health.cmd)
    pushOpt(args, '--health-interval', opts.health.interval)
    if (opts.health.retries !== undefined) args.push('--health-retries', String(opts.health.retries))
    pushOpt(args, '--health-start-period', opts.health.startPeriod)
    pushOpt(args, '--health-timeout', opts.health.timeout)
  }
  args.push(opts.image.trim())
  if (opts.command?.trim()) args.push(...splitCommand(opts.command.trim()))
  return args
}
