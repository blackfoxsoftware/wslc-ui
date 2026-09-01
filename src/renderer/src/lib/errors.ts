/** Mensagem legível a partir de um erro desconhecido (catch). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
