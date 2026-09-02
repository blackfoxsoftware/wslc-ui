import { logInfo } from './services/logger'
import { ops } from './services/wslc/ops'
import { stopAllStreams } from './services/wslc/streams'
import { closeAllTerminals } from './services/wslc/terminals'

/**
 * Encerramento ordenado do lado wslc, na ordem que importa: parar o que está
 * em curso, limpar os containers que precisam ser limpos e só então soltar a
 * sessão nativa.
 *
 * Soltar a sessão não é opcional. Um processo que morre sem soltá-la deixa a
 * sessão "WslcUi" viva no WSL, e a abertura seguinte recebe
 * ERROR_ALREADY_EXISTS — o app fica sem motor nativo até alguém desligar o WSL
 * na mão.
 *
 * Roda UMA vez por processo: fechar a janela e instalar uma atualização levam
 * os dois a este mesmo caminho, e a segunda passada não teria o que fazer além
 * de atrasar a saída.
 */
let running: Promise<void> | null = null

export function shutdownWslc(): Promise<void> {
  running ??= (async () => {
    logInfo('app', 'Encerrando: streams, terminais e containers nativos')
    stopAllStreams()
    await closeAllTerminals().catch(() => undefined)
    // Na ABI 2.9.3 os containers nativos precisam sair aqui, senão viram
    // registros órfãos e invisíveis; da 2.9.9 em diante eles ficam, e o app os
    // reabre pelo nome. Quem decide é cleanupContainers, pela ABI da DLL.
    await ops()
      .native.cleanupContainers()
      .catch(() => undefined)
    ops().native.releaseSession()
  })()
  return running
}
