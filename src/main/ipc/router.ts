import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  invokeChannels,
  invokeContract,
  type InvokeChannel,
  type InvokeInput,
  type InvokeOutput
} from '@shared/ipc/contract'
import { logError } from '../services/logger'

export interface InvokeContext {
  event: IpcMainInvokeEvent
}

/** Um handler por canal do contrato — o compilador exige o mapa completo. */
export type InvokeHandlers = {
  [C in InvokeChannel]: (
    input: InvokeInput<C>,
    ctx: InvokeContext
  ) => Promise<InvokeOutput<C>> | InvokeOutput<C>
}

/**
 * Registra todos os canais invoke com validação Zod nas duas direções:
 * o payload recebido é `parse`ado antes do handler e o resultado é
 * `parse`ado antes de voltar ao renderer.
 */
export function registerInvokeHandlers(handlers: InvokeHandlers): void {
  for (const channel of invokeChannels) {
    const { input, output } = invokeContract[channel]
    const handler = handlers[channel] as (input: unknown, ctx: InvokeContext) => unknown
    ipcMain.handle(channel, async (event, rawInput: unknown) => {
      try {
        const parsed = input.parse(rawInput)
        const result = await handler(parsed, { event })
        return output.parse(result)
      } catch (e) {
        // Falha dura (validação Zod ou exceção do handler) — os erros "de
        // negócio" voltam como CommandResult e são logados na origem.
        logError('ipc', `Canal ${channel} falhou`, e instanceof Error ? (e.stack ?? e.message) : String(e))
        throw e
      }
    })
  }
}

export function unregisterInvokeHandlers(): void {
  for (const channel of invokeChannels) {
    ipcMain.removeHandler(channel)
  }
}
