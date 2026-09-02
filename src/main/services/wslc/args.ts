/**
 * Dois utilitários compartilhados por quem monta linha de comando da CLI
 * (`run-args.ts`, `stream-args.ts`, `real.ts`).
 *
 * O corte de espaços e o descarte de vazios ficam aqui de propósito: um campo
 * de formulário em branco não pode virar `--flag ""` na linha de comando — o
 * wslc trata isso como valor inválido, não como ausência.
 */

/** Empurra `flag valor` quando o valor não está vazio. */
export function pushOpt(args: string[], flag: string, value: string | undefined): void {
  if (value?.trim()) args.push(flag, value.trim())
}

/** Empurra `flag item` para cada item não vazio. */
export function pushEach(args: string[], flag: string, values: string[] | undefined): void {
  for (const v of values ?? []) if (v.trim()) args.push(flag, v.trim())
}
