/**
 * Filtro do ruído de subida do shell no terminal embutido.
 *
 * Os dois motores abrem `sh -i` sem TTY (o SDK preview não tem PTY e a CLI roda
 * com pipe), então o shell reclama do job control assim que sobe:
 *
 *   sh: can't access tty; job control turned off
 *
 * É diagnóstico técnico que só repete — pior — o aviso que a UI já mostra no
 * topo do terminal ("Shell em modo linha (sem TTY no preview)"). O `-i` fica:
 * é ele que dá o prompt.
 *
 * O filtro só vale ANTES da primeira linha digitada (`stop()` é chamado no
 * primeiro write). Depois disso nada é tocado, então é impossível engolir a
 * saída de um comando do usuário.
 */

/** Linha de diagnóstico do shell sobre job control / grupo de processo. */
const NOISE_LINE =
  /^(?:sh|ash|bash|dash|busybox):[^\n]*(?:job control|terminal process group)[^\n]*(?:\r?\n|$)/

const SHELLS = ['sh', 'ash', 'bash', 'dash', 'busybox']

/**
 * O trecho sem `\n` no fim do chunk ainda pode virar uma linha de ruído?
 *
 * Serve para o caso de a mensagem chegar partida em dois chunks. Só segura o
 * que parece começo de nome de shell — o prompt (`/ # `) nunca casa, então ele
 * nunca fica preso esperando.
 */
function couldGrowIntoNoise(tail: string): boolean {
  if (tail === '') return false
  if (SHELLS.some((s) => s.startsWith(tail))) return true
  return SHELLS.some((s) => tail.startsWith(`${s}:`))
}

export interface StartupFilter {
  /** Passa um chunk pelo filtro; devolve o que deve ir para a tela. */
  push(chunk: string): string
  /** Desliga o filtro e devolve o que estava retido. */
  stop(): string
}

export function createStartupFilter(): StartupFilter {
  let active = true
  let carry = ''

  return {
    push(chunk) {
      if (!active) return chunk

      let text = carry + chunk
      carry = ''

      // Pode vir mais de uma linha de aviso (ex.: bash reclama duas vezes).
      let m = NOISE_LINE.exec(text)
      while (m !== null) {
        text = text.slice(m[0].length)
        m = NOISE_LINE.exec(text)
      }

      const lastBreak = text.lastIndexOf('\n')
      const tail = text.slice(lastBreak + 1)
      if (couldGrowIntoNoise(tail)) {
        carry = tail
        return text.slice(0, lastBreak + 1)
      }
      return text
    },
    stop() {
      active = false
      const pending = carry
      carry = ''
      return pending
    }
  }
}
