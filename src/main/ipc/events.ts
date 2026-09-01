import type { WebContents } from 'electron'
import { eventContract, type EventChannel, type EventPayload } from '@shared/ipc/contract'
import type { StreamSink } from '../services/wslc/streams'
import type { TerminalSink } from '../services/wslc/terminals'

/** Emite um evento main → renderer validando o payload pelo contrato. */
export function sendEvent<C extends EventChannel>(
  sender: WebContents,
  channel: C,
  payload: EventPayload<C>
): void {
  if (sender.isDestroyed()) return
  sender.send(channel, eventContract[channel].parse(payload))
}

/** Sink de stream que encaminha os eventos para um WebContents. */
export function rendererStreamSink(sender: WebContents): StreamSink {
  return {
    data: (ev) => sendEvent(sender, 'streams:data', ev),
    exit: (ev) => sendEvent(sender, 'streams:exit', ev),
    progress: (ev) => sendEvent(sender, 'streams:progress', ev)
  }
}

/** Sink do terminal embutido que encaminha os eventos para um WebContents. */
export function rendererTerminalSink(sender: WebContents): TerminalSink {
  return {
    data: (ev) => sendEvent(sender, 'terminal:data', ev),
    exit: (ev) => sendEvent(sender, 'terminal:exit', ev)
  }
}
