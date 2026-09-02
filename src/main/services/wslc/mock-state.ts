import type { CommandResult, UpdateMode } from '@shared/schemas'

/**
 * Estado e ajustes do modo de demonstração (WSLC_UI_MOCK).
 *
 * Existe para o app ser dirigível de fora sem tocar no WSL: além dos dados
 * fictícios, o dublê aceita INJEÇÃO DE FALHA, para que o caminho triste de
 * cada operação seja reproduzível — e não dependa de derrubar o WSL de
 * verdade para ver a mensagem de erro.
 *
 *   WSLC_UI_MOCK_FAIL=volumes:create,images:pull   falha essas operações
 *   WSLC_UI_MOCK_PICK=cancel                       diálogo de arquivo cancelado
 *   WSLC_UI_MOCK_PICK=C:\caminho\x.tar             caminho devolvido pelo diálogo
 *   WSLC_UI_MOCK_TICK_MS=40                        cadência dos streams falsos
 *   WSLC_UI_MOCK_UPDATE=portable                   modo do auto-updater simulado
 *
 * As chaves de falha são os canais do contrato IPC (`volumes:create`), mais
 * `engine:native` para a criação da sessão nativa.
 */

let failures: Set<string> | null = null

function failureSet(): Set<string> {
  failures ??= new Set(
    (process.env['WSLC_UI_MOCK_FAIL'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return failures
}

/** Esta operação foi marcada para falhar? */
export function shouldFail(channel: string): boolean {
  return failureSet().has(channel)
}

/** Falha padrão de uma operação que responde CommandResult. */
export function failure(channel: string, detail: string): CommandResult {
  return { ok: false, code: 1, stdout: '', stderr: `(demo) ${detail} [falha injetada em ${channel}]` }
}

/** Erro duro, para as operações de LISTAGEM (viram alerta na view). */
export function failHard(channel: string, detail: string): never {
  throw new Error(`(demo) ${detail} [falha injetada em ${channel}]`)
}

/** Cadência dos streams e da instalação simulados. */
export function tickMs(): number {
  const raw = Number.parseInt(process.env['WSLC_UI_MOCK_TICK_MS'] ?? '', 10)
  return Number.isInteger(raw) && raw > 0 ? raw : 80
}

/**
 * Modo do auto-updater simulado. O padrão é 'installer' porque é o caso que
 * a maioria das pessoas terá; 'portable' e 'disabled' existem para as telas
 * que só aparecem neles serem alcançáveis em teste.
 */
export function mockUpdateMode(): UpdateMode {
  const raw = process.env['WSLC_UI_MOCK_UPDATE']
  return raw === 'portable' || raw === 'disabled' ? raw : 'installer'
}

/** Caminho devolvido pelos diálogos de arquivo; 'cancel' simula o cancelamento. */
export function pickedPath(fallback: string): string | null {
  const raw = process.env['WSLC_UI_MOCK_PICK']
  if (raw === undefined || raw === '') return fallback
  return raw === 'cancel' ? null : raw
}

// A instalação guiada (WSLC_UI_MOCK=setup) deixa o ambiente pronto: o dublê
// do ambiente consulta isto para o "Verificar novamente" mudar de resposta.
let installed = false

export function markEnvironmentInstalled(): void {
  installed = true
}

export function isEnvironmentInstalled(): boolean {
  return installed
}

/** Zera o estado de processo do dublê (testes). */
export function resetMockState(): void {
  failures = null
  installed = false
}
