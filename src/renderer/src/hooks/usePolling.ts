import { useEffect, useRef } from 'react'

/**
 * Executa `fn` imediatamente e depois a cada `intervalMs`. Mudar o
 * `restartKey` reinicia o ciclo (com execução imediata). A referência de
 * `fn` pode mudar entre renders sem reiniciar o timer.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, restartKey?: unknown): void {
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    void fnRef.current()
    const timer = setInterval(() => void fnRef.current(), intervalMs)
    return () => clearInterval(timer)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- restartKey só serve para reiniciar o ciclo
  }, [intervalMs, restartKey])
}
