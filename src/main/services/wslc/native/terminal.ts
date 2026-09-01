import { logInfo } from '../../logger'
import { createStartupFilter } from '../terminal-noise'
import { allocTerminalId, registerTerminal, releaseTerminal, type TerminalSink } from '../terminals'
import {
  decodeBytes,
  hrHex,
  hrOk,
  Keep,
  registerCallback,
  unregisterCallback,
  type WslcSdk
} from './bindings'
import { findNativeContainer } from './containers'
import { callNative } from './session'

/**
 * Terminal embutido no motor nativo (Fase 3) — bridge por FIFO.
 *
 * O SDK preview NÃO expõe o handle de STDIN (`WslcGetProcessIOHandle(STDIN)`
 * devolve E_INVALIDARG até em processo vivo — validado por probe) e não tem
 * PTY. O contorno: um processo persistente roda `sh -i` lendo de um FIFO
 * dentro do container (a saída chega pelos callbacks de stdout/stderr, que
 * funcionam) e cada linha digitada é entregue por um exec curto que escreve
 * no FIFO. O wrapper mantém um fd de escrita aberto (exec 3<>fifo), então o
 * shell nunca vê EOF e os escritores nunca bloqueiam na abertura.
 *
 * Resultado: shell REAL e persistente (cd/export mantêm estado entre linhas),
 * em modo linha — sem tty, apps full-screen (vim, top) não funcionam.
 */

const SIGKILL = 9
const WRITE_TIMEOUT_MS = 5000
const CLOSE_FALLBACK_MS = 2000

type AllocType = Parameters<WslcSdk['alloc']>[0]

function check(fnName: string, hr: number): void {
  if (!hrOk(hr)) throw new Error(`${fnName} falhou: ${hrHex(hr)}`)
}

export async function openNativeTerminal(containerId: string, sink: TerminalSink): Promise<number> {
  const container = findNativeContainer(containerId)
  if (!container) {
    throw new Error(
      `Container "${containerId}" não encontrado na sessão nativa (o app só gerencia containers criados por ele nesta execução).`
    )
  }
  const { sdk } = container
  const id = allocTerminalId()
  const fifo = `/tmp/.wslcui-term-${id}`
  const keep = new Keep()
  const callbackIds: bigint[] = []
  let procHandle: unknown = null
  let exited = false

  // Sem TTY o `sh -i` reclama do job control ao subir; o aviso é filtrado até a
  // primeira linha digitada (ver terminal-noise.ts).
  const noise = createStartupFilter()
  const emit = (chunk: string): void => {
    if (chunk) sink.data({ id, chunk })
  }

  const finish = (code: number | null): void => {
    if (exited) return
    exited = true
    releaseTerminal(id)
    emit(noise.stop())
    sink.exit({ id, code })
    const proc = procHandle
    procHandle = null
    if (!proc) return
    // Release assíncrono, e unregister só DEPOIS (regras de deadlock da Fase 2).
    void callNative(sdk.raw['WslcReleaseProcess'], proc)
      .catch(() => 0)
      .then(() => {
        for (const cb of callbackIds) {
          try {
            unregisterCallback(cb)
          } catch {
            // já removido
          }
        }
      })
  }

  const onIo = registerCallback((_io: number, data: unknown, bytes: number) => {
    emit(noise.push(decodeBytes(data, bytes).toString('utf8')))
  }, sdk.types['StdIOCallback'])
  const onExit = registerCallback((code: number) => finish(code), sdk.types['ProcessExitCallback'])
  callbackIds.push(onIo, onExit)

  try {
    const ps = keep.hold(sdk.alloc(sdk.types['ProcessSettings'] as AllocType, 1))
    check('WslcInitProcessSettings', sdk.raw['WslcInitProcessSettings'](ps))
    const script = `rm -f ${fifo}; mkfifo -m 600 ${fifo} || exit 41; exec 3<>${fifo}; exec sh -i <${fifo}`
    const argv = ['sh', '-c', script]
    check(
      'WslcSetProcessSettingsCmdLine',
      sdk.raw['WslcSetProcessSettingsCmdLine'](ps, keep.strArray(argv), argv.length)
    )
    const env = ['TERM=xterm-256color']
    check(
      'WslcSetProcessSettingsEnvVariables',
      sdk.raw['WslcSetProcessSettingsEnvVariables'](ps, keep.strArray(env), env.length)
    )
    const cbStruct = keep.struct(sdk.types['ProcessCallbacks'], { onStdOut: onIo, onStdErr: onIo, onExit })
    check('WslcSetProcessSettingsCallbacks', sdk.raw['WslcSetProcessSettingsCallbacks'](ps, cbStruct, null))

    const procOut: unknown[] = [null]
    const errOut: (string | null)[] = [null]
    const hr = await callNative(sdk.raw['WslcCreateContainerProcess'], container.handle, ps, procOut, errOut)
    if (!hrOk(hr) || !procOut[0]) {
      throw new Error(errOut[0] || `WslcCreateContainerProcess falhou: ${hrHex(hr)}`)
    }
    procHandle = procOut[0]
  } catch (e) {
    for (const cb of callbackIds) {
      try {
        unregisterCallback(cb)
      } catch {
        // já removido
      }
    }
    throw e
  }

  /** Entrega uma linha ao FIFO via exec curto; espera o exit para preservar a ordem. */
  const sendLine = async (line: string): Promise<void> => {
    if (exited) return
    const wKeep = new Keep()
    const wCallbacks: bigint[] = []
    let settle!: () => void
    const wrote = new Promise<void>((resolve) => {
      settle = resolve
    })
    try {
      const ps = wKeep.hold(sdk.alloc(sdk.types['ProcessSettings'] as AllocType, 1))
      check('WslcInitProcessSettings', sdk.raw['WslcInitProcessSettings'](ps))
      // A linha vai como $0 — printf a escreve literalmente, sem interpretação aqui.
      const argv = ['sh', '-c', `printf '%s\\n' "$0" >${fifo}`, line]
      check(
        'WslcSetProcessSettingsCmdLine',
        sdk.raw['WslcSetProcessSettingsCmdLine'](ps, wKeep.strArray(argv), argv.length)
      )
      const wExit = registerCallback(() => settle(), sdk.types['ProcessExitCallback'])
      wCallbacks.push(wExit)
      const cbStruct = wKeep.struct(sdk.types['ProcessCallbacks'], {
        onStdOut: null,
        onStdErr: null,
        onExit: wExit
      })
      check('WslcSetProcessSettingsCallbacks', sdk.raw['WslcSetProcessSettingsCallbacks'](ps, cbStruct, null))

      const procOut: unknown[] = [null]
      const errOut: (string | null)[] = [null]
      const hr = await callNative(
        sdk.raw['WslcCreateContainerProcess'],
        container.handle,
        ps,
        procOut,
        errOut
      )
      if (!hrOk(hr) || !procOut[0]) {
        sink.data({ id, chunk: `\r\n[falha ao enviar a linha: ${errOut[0] || hrHex(hr)}]\r\n` })
        for (const cb of wCallbacks) unregisterCallback(cb)
        return
      }
      let watchdog: NodeJS.Timeout | undefined
      await Promise.race([
        wrote,
        new Promise<void>((resolve) => {
          watchdog = setTimeout(resolve, WRITE_TIMEOUT_MS)
          watchdog.unref()
        })
      ])
      if (watchdog) clearTimeout(watchdog)
      void callNative(sdk.raw['WslcReleaseProcess'], procOut[0])
        .catch(() => 0)
        .then(() => {
          for (const cb of wCallbacks) {
            try {
              unregisterCallback(cb)
            } catch {
              // já removido
            }
          }
        })
    } catch (e) {
      for (const cb of wCallbacks) {
        try {
          unregisterCallback(cb)
        } catch {
          // já removido
        }
      }
      sink.data({ id, chunk: `\r\n[falha ao enviar a linha: ${e instanceof Error ? e.message : e}]\r\n` })
    }
  }

  // Escritas serializadas: dois execs concorrentes poderiam inverter a ordem.
  let queue: Promise<void> = Promise.resolve()
  registerTerminal(id, {
    write: (line) => {
      emit(noise.stop())
      queue = queue.then(() => sendLine(line))
      return queue
    },
    close: async () => {
      if (!procHandle) return
      await callNative(sdk.raw['WslcSignalProcess'], procHandle, SIGKILL).catch(() => 0)
      // O exit callback chama finish(); fallback caso ele não chegue.
      const fallback = setTimeout(() => finish(null), CLOSE_FALLBACK_MS)
      fallback.unref()
    }
  })
  logInfo('terminal', `Terminal #${id} aberto no container ${container.id.slice(0, 12)} (motor nativo)`)
  return id
}
