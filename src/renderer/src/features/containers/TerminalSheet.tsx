import { useEffect, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { ContainerInfo } from '@shared/schemas'
import { AppSheet, StateChip } from '@/design'
import { errorMessage } from '@/lib/errors'
import { handleTerminalInput, initialInputState } from '@/lib/terminal-input'
import '@xterm/xterm/css/xterm.css'

/**
 * Terminal embutido (xterm.js) com shell interativo dentro do container.
 * O shell roda sem TTY (limitação do wslc em preview), então o eco e a edição
 * de linha são locais (lib/terminal-input.ts) e cada Enter envia a linha
 * inteira — programas de tela cheia (vim, top) não funcionam.
 */

interface Props {
  container: ContainerInfo
  onClose: () => void
}

// Paleta alinhada ao tema: grafite do app, ciano da marca no cursor.
const TERM_THEME = {
  background: '#0b0d12',
  foreground: '#e4e7ee',
  cursor: '#00b5cc',
  selectionBackground: '#20323a'
}

/** Remove o prefixo que o Electron acrescenta a erros de invoke. */
function cleanIpcError(e: unknown): string {
  return errorMessage(e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

export default function TerminalSheet({ container, onClose }: Props): React.JSX.Element {
  // O overlay só monta os filhos num efeito próprio: um useRef estaria null no
  // primeiro efeito deste componente. Callback ref + estado resolve.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [running, setRunning] = useState(true)
  const label = container.name || container.id.slice(0, 12)

  useEffect(() => {
    if (!host) return

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
      theme: TERM_THEME,
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    const refit = (): void => {
      try {
        fit.fit()
      } catch {
        // painel ainda sem dimensões
      }
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(host)

    let terminalId: number | null = null
    let disposed = false
    let alive = false
    let inputState = initialInputState()

    const offData = window.wslcApi.onTerminalData((ev) => {
      if (ev.id === terminalId) term.write(ev.chunk)
    })
    const offExit = window.wslcApi.onTerminalExit((ev) => {
      if (ev.id !== terminalId) return
      alive = false
      setRunning(false)
      term.write(`\r\n\x1b[33m[sessão encerrada${ev.code !== null ? `, código ${ev.code}` : ''}]\x1b[0m\r\n`)
    })
    const inputSub = term.onData((data) => {
      if (!alive || terminalId === null) return
      const result = handleTerminalInput(inputState, data)
      inputState = result.state
      if (result.clear) term.clear()
      if (result.echo) term.write(result.echo)
      for (const line of result.lines) void window.wslcApi.writeTerminal(terminalId, line)
    })

    term.writeln(`\x1b[90mConectando ao container ${label}…\x1b[0m`)
    window.wslcApi.openTerminal(container.id || container.name).then(
      (id) => {
        if (disposed) {
          void window.wslcApi.closeTerminal(id)
          return
        }
        terminalId = id
        alive = true
        term.focus()
      },
      (e: unknown) => {
        setRunning(false)
        term.write(`\r\n\x1b[31m${cleanIpcError(e)}\x1b[0m\r\n`)
      }
    )

    return () => {
      disposed = true
      offData()
      offExit()
      inputSub.dispose()
      observer.disconnect()
      if (terminalId !== null) void window.wslcApi.closeTerminal(terminalId)
      term.dispose()
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- uma sessão por abertura
  }, [host])

  return (
    <AppSheet
      bodyClassName="min-h-0"
      description="Shell em modo linha (sem TTY no preview): edição e histórico são locais; programas de tela cheia não funcionam."
      title={`Terminal · ${label}`}
      width="w-[min(58rem,94vw)]"
      onClose={onClose}
    >
      <StateChip
        className="mb-3"
        label={running ? 'conectado' : 'encerrado'}
        tone={running ? 'success' : 'default'}
      />
      <div ref={setHost} className="inset-well size-full overflow-hidden p-2" />
    </AppSheet>
  )
}
