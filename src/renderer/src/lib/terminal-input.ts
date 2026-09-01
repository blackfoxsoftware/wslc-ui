/**
 * Disciplina de linha do terminal embutido (modo "cooked" local).
 *
 * O shell dentro do container roda sem TTY (o SDK preview não tem PTY e a CLI
 * roda com pipe), então ele NÃO ecoa o que digitamos nem edita a linha. Este
 * módulo faz isso localmente no xterm: eco, backspace, Ctrl+C/Ctrl+L e
 * histórico com as setas. Cada Enter envia a linha completa ao processo main.
 */

export interface TerminalInputState {
  /** linha em edição (ainda não enviada) */
  buffer: string
  /** linhas já enviadas (mais antiga primeiro) */
  history: string[]
  /** null = editando linha nova; índice ao navegar no histórico */
  historyIndex: number | null
}

export interface TerminalInputResult {
  state: TerminalInputState
  /** o que ecoar no xterm */
  echo: string
  /** linhas completas para enviar ao shell */
  lines: string[]
  /** Ctrl+L: limpar a tela */
  clear: boolean
}

const MAX_HISTORY = 100

export function initialInputState(): TerminalInputState {
  return { buffer: '', history: [], historyIndex: null }
}

/** Apaga a linha em edição no eco e escreve o novo conteúdo. */
function replaceLine(oldText: string, newText: string): string {
  return '\b \b'.repeat(oldText.length) + newText
}

/**
 * Processa a entrada crua do xterm (uma tecla ou um paste com várias linhas)
 * e devolve o eco local, as linhas completas e o próximo estado.
 */
export function handleTerminalInput(state: TerminalInputState, data: string): TerminalInputResult {
  let { buffer, historyIndex } = state
  const history = [...state.history]
  let echo = ''
  const lines: string[] = []
  let clear = false

  const submit = (): void => {
    echo += '\r\n'
    lines.push(buffer)
    if (buffer.trim() && history.at(-1) !== buffer) {
      history.push(buffer)
      if (history.length > MAX_HISTORY) history.shift()
    }
    buffer = ''
    historyIndex = null
  }

  let i = 0
  while (i < data.length) {
    const ch = data[i]

    if (ch === '\x1b') {
      // Sequência CSI (setas etc.): consome "\x1b[" + parâmetros + byte final.
      if (data[i + 1] === '[') {
        let j = i + 2
        while (j < data.length && !/[A-Za-z~]/.test(data[j] ?? '')) j++
        const final = data[j]
        if (final === 'A' && history.length > 0) {
          // seta ↑
          const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
          echo += replaceLine(buffer, history[next] ?? '')
          buffer = history[next] ?? ''
          historyIndex = next
        } else if (final === 'B' && historyIndex !== null) {
          // seta ↓
          const next = historyIndex + 1
          const text = next >= history.length ? '' : (history[next] ?? '')
          echo += replaceLine(buffer, text)
          buffer = text
          historyIndex = next >= history.length ? null : next
        }
        i = j + 1
        continue
      }
      i++
      continue
    }

    if (ch === '\r') {
      submit()
      // paste no estilo CRLF: pula o \n colado ao \r
      if (data[i + 1] === '\n') i++
      i++
      continue
    }
    if (ch === '\n') {
      submit()
      i++
      continue
    }
    if (ch === '\x7f' || ch === '\b') {
      if (buffer.length > 0) {
        buffer = buffer.slice(0, -1)
        echo += '\b \b'
      }
      i++
      continue
    }
    if (ch === '\x03') {
      // Ctrl+C: descarta a linha local (sem TTY não há como sinalizar o job).
      echo += '^C\r\n'
      buffer = ''
      historyIndex = null
      i++
      continue
    }
    if (ch === '\x0c') {
      clear = true
      i++
      continue
    }
    if (ch !== undefined && ch >= ' ') {
      buffer += ch
      echo += ch
    }
    i++
  }

  return { state: { buffer, history, historyIndex }, echo, lines, clear }
}
