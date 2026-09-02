import type { ContainerLogsOptions } from '@shared/schemas'

/**
 * Quantas linhas o botão de logs pede por padrão.
 *
 * Sem `--tail` a CLI despeja o log inteiro desde o primeiro byte: num
 * container antigo isso são megabytes para chegar até a linha que interessa,
 * que é a última. A cauda é o comportamento útil; o log inteiro continua a um
 * clique de distância, no diálogo de opções.
 */
export const TAIL_PADRAO = 500

/** As opções do motor CLI aplicadas ao abrir os logs pelo botão da lista. */
export const LOG_PADRAO: ContainerLogsOptions = { follow: true, tail: TAIL_PADRAO }

/**
 * Título do painel de saída. Ele diz o recorte porque a diferença entre "o
 * log todo" e "as últimas 500 linhas" não aparece em lugar nenhum na tela —
 * e quem procura uma linha que não está ali precisa saber por quê.
 */
export function logStreamTitle(label: string, opts?: ContainerLogsOptions): string {
  const partes = [
    opts?.tail === undefined ? 'log completo' : `últimas ${opts.tail} linhas`,
    opts?.timestamps ? 'com hora' : '',
    opts?.since ? `desde ${opts.since}` : '',
    opts?.until ? `até ${opts.until}` : ''
  ].filter(Boolean)
  return `Logs de ${label} (${partes.join(', ')})`
}
