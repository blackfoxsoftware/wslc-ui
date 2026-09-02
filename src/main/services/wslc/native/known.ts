import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { sessionStoragePath } from './session'

/**
 * Containers nativos que este app criou, lembrados entre execuções.
 *
 * Por que um arquivo, e não só memória: o SDK **não enumera containers**. Nem
 * na 2.9.9 — ela ganhou `WslcOpenContainer`, que abre um container por nome ou
 * ID, mas continua não havendo "liste tudo". Então, para reencontrar o que o
 * app criou, o app precisa lembrar os nomes.
 *
 * Isso é o que permite os containers nativos SOBREVIVEREM ao fechamento do app
 * (na ABI 2.9.3 eles eram apagados na saída, senão viravam órfãos permanentes).
 * Medido: soltar a sessão derruba os containers em execução para EXITED, mas o
 * registro fica, `WslcOpenContainer` reabre por nome numa execução seguinte, e
 * `WslcStartContainer` no handle reaberto os põe de volta em RUNNING.
 *
 * Mora dentro do storage da sessão, e não no settings.json, porque é estado
 * DAQUELE storage: o reset da sessão apaga a pasta e leva este arquivo junto,
 * que é exatamente o comportamento certo.
 */

export interface KnownContainer {
  /** ID completo (64 hex) — é por ele que o reopen tenta primeiro. */
  id: string
  name: string
  image: string
  command: string
  createdAt: number
  portsDisplay: string
  autoRemove: boolean
}

export function knownFilePath(storage: string = sessionStoragePath()): string {
  return join(storage, 'containers.json')
}

export function readKnownContainers(file: string = knownFilePath()): KnownContainer[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is KnownContainer =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as KnownContainer).id === 'string' &&
        typeof (c as KnownContainer).name === 'string'
    )
  } catch {
    // Sem arquivo, JSON podre ou storage recém-resetado: nada a lembrar.
    return []
  }
}

function write(list: KnownContainer[], file: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(list, null, 2), 'utf8')
  } catch {
    // Lembrar é melhor-esforço: falhar aqui não pode derrubar a criação de um
    // container que já existe de verdade no storage.
  }
}

export function rememberContainer(c: KnownContainer, file: string = knownFilePath()): void {
  const list = readKnownContainers(file).filter((k) => k.id !== c.id)
  list.push(c)
  write(list, file)
}

export function forgetContainer(id: string, file: string = knownFilePath()): void {
  const list = readKnownContainers(file)
  const restante = list.filter((k) => k.id !== id)
  if (restante.length !== list.length) write(restante, file)
}

export function forgetAllContainers(file: string = knownFilePath()): void {
  write([], file)
}
