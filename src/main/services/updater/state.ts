import type { UpdateMode, UpdateStatus } from '@shared/schemas'

/**
 * Núcleo do auto-updater: o estado e as transições, sem Electron e sem rede.
 *
 * A parte do updater que erra não é a que fala com o GitHub — é a que decide o
 * que mostrar depois. Aqui ficam as regras que importam, testáveis sem subir
 * app nenhum: quem pode se atualizar, e o que cada evento faz com o estado.
 */

/** As mesmas coordenadas do `publish` do electron-builder.yml. */
export const GITHUB_OWNER = 'blackfoxsoftware'
export const GITHUB_REPO = 'wslc-ui'

/**
 * Página da release de uma versão. O provedor do electron-updater devolve os
 * arquivos, não o endereço da release — e o modo portátil precisa justamente
 * do endereço, porque lá a atualização é manual.
 */
export function releasePageUrl(version: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`
}

export const DISABLED_REASON =
  'O app está rodando do código-fonte: não há instalação para atualizar por cima.'
export const PORTABLE_REASON = 'A versão portátil não se instala sozinha — o app avisa e leva para a release.'

/**
 * Em que situação este processo está.
 *
 * `PORTABLE_EXECUTABLE_DIR` é posta pelo .exe auto-extraível do alvo portable:
 * é o único sinal confiável de que não existe instalação por baixo. Sem esta
 * checagem, o portátil baixaria um instalador NSIS e o rodaria contra uma
 * pasta temporária — trocando o app da pessoa por um que ela não pediu.
 */
export function detectMode(packaged: boolean, env: NodeJS.ProcessEnv = process.env): UpdateMode {
  if (!packaged) return 'disabled'
  if (env['PORTABLE_EXECUTABLE_DIR']) return 'portable'
  return 'installer'
}

export function initialStatus(currentVersion: string, mode: UpdateMode): UpdateStatus {
  return {
    mode,
    state: 'idle',
    currentVersion,
    newVersion: null,
    percent: null,
    releaseNotes: null,
    releaseUrl: null,
    checkedAt: null,
    error: null,
    reason: mode === 'disabled' ? DISABLED_REASON : mode === 'portable' ? PORTABLE_REASON : null
  }
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'up-to-date'; at: number }
  | { type: 'available'; version: string; notes: string | null; at: number }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

const clampPercent = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/**
 * Próximo estado. Três regras aqui não são óbvias e são as que sustentam o
 * resto:
 *
 * 1. Sem updater (modo 'disabled'), evento nenhum mexe no estado. Um evento
 *    perdido não pode acender na UI um botão que não instala nada.
 * 2. Erro DEPOIS de uma versão já baixada não apaga a versão baixada: ela
 *    continua no disco e vai ser instalada ao fechar o app. O erro vira só uma
 *    mensagem ao lado.
 * 3. Falha ao baixar preserva `newVersion`/`releaseUrl` — é o que permite
 *    oferecer "baixar da release" quando o caminho automático não deu certo.
 */
export function applyEvent(status: UpdateStatus, ev: UpdateEvent): UpdateStatus {
  if (status.mode === 'disabled') return status

  switch (ev.type) {
    case 'checking':
      // Já baixada é o fim da linha desta execução: a próxima abertura já é a
      // versão nova, então checar de novo não teria o que fazer com o resultado.
      if (status.state === 'downloaded') return status
      return { ...status, state: 'checking', error: null }

    case 'up-to-date':
      return {
        ...status,
        state: 'up-to-date',
        newVersion: null,
        percent: null,
        releaseNotes: null,
        releaseUrl: null,
        checkedAt: ev.at,
        error: null
      }

    case 'available':
      return {
        ...status,
        state: 'available',
        newVersion: ev.version,
        releaseNotes: ev.notes,
        releaseUrl: releasePageUrl(ev.version),
        checkedAt: ev.at,
        percent: null,
        error: null
      }

    case 'progress':
      if (status.state === 'downloaded') return status
      return { ...status, state: 'downloading', percent: clampPercent(ev.percent) }

    case 'downloaded':
      return {
        ...status,
        state: 'downloaded',
        newVersion: ev.version,
        releaseUrl: releasePageUrl(ev.version),
        percent: 100,
        error: null
      }

    case 'error':
      if (status.state === 'downloaded') return { ...status, error: ev.message }
      return { ...status, state: 'error', percent: null, error: ev.message }
  }
}
