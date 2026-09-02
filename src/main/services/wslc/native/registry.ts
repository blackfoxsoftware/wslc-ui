import type { CommandResult } from '@shared/schemas'
import { logInfo } from '../../logger'
import { hrText, hrOk, Keep } from './bindings'
import { acquireNativeSession, callNative } from './session'

/**
 * Auth de registry da sessão nativa (Fase 5): WslcSessionAuthenticate valida
 * as credenciais (registry sem auth devolve S_OK com token vazio; credencial
 * errada devolve 0x80004005 com mensagem legível). As credenciais ficam SÓ EM
 * MEMÓRIA (por execução do app) e viram o blob X-Registry-Auth (base64 de
 * JSON, formato do Docker) usado por push e pull.
 */

export const DEFAULT_REGISTRY = 'index.docker.io'

interface RegistryCredentials {
  username: string
  password: string
  identityToken: string
}

const credentials = new Map<string, RegistryCredentials>()

/**
 * Registry de uma referência de imagem, pela regra do Docker: o 1º segmento
 * só é um registry se tiver "." ou ":" (host/porta) ou for "localhost".
 */
export function registryFromRef(ref: string): string {
  const first = ref.split('/')[0] ?? ''
  if (ref.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    return first
  }
  return DEFAULT_REGISTRY
}

/** Blob X-Registry-Auth (base64 de JSON) para as credenciais dadas. */
export function encodeRegistryAuth(server: string, creds: RegistryCredentials | null): string {
  if (!creds) return Buffer.from('{}', 'utf8').toString('base64')
  const payload = creds.identityToken
    ? { identitytoken: creds.identityToken }
    : { username: creds.username, password: creds.password, serveraddress: server }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

/** Blob de auth do login para o registry de `ref`, ou null se não houver login. */
export function storedRegistryAuthFor(ref: string): string | null {
  const server = registryFromRef(ref)
  const creds = credentials.get(server)
  return creds ? encodeRegistryAuth(server, creds) : null
}

/**
 * Auth para push de `ref`: credenciais do login quando houver, senão anônimo
 * ("{}") — no push o campo é obrigatório (NULL = E_INVALIDARG).
 */
export function registryAuthFor(ref: string): string {
  return storedRegistryAuthFor(ref) ?? encodeRegistryAuth('', null)
}

export function hasRegistryCredentials(server: string): boolean {
  return credentials.has(server || DEFAULT_REGISTRY)
}

/** Só para testes: limpa as credenciais guardadas. */
export function clearRegistryCredentials(): void {
  credentials.clear()
}

/**
 * Logout nativo: descarta as credenciais guardadas em memória (`server`
 * vazio = registry padrão). Não há chamada de SDK — o login nativo nunca
 * persiste nada fora do processo.
 */
export function logoutNativeRegistry(server: string): CommandResult {
  const address = server.trim() || DEFAULT_REGISTRY
  const existed = credentials.delete(address)
  if (existed) logInfo('native', `Logout de ${address} (credenciais descartadas)`)
  return {
    ok: true,
    code: 0,
    stdout: existed
      ? `Logout de ${address} OK — credenciais descartadas da memória.`
      : `Não havia login em ${address} nesta execução.`,
    stderr: ''
  }
}

/**
 * Valida usuário/senha contra o registry e guarda as credenciais em memória.
 * `server` vazio = Docker Hub.
 */
export async function loginNativeRegistry(
  server: string,
  username: string,
  password: string
): Promise<CommandResult> {
  const address = server.trim() || DEFAULT_REGISTRY
  const keep = new Keep()
  try {
    const { sdk, handle: session } = await acquireNativeSession()
    const tokenOut: (string | null)[] = [null]
    const errOut: (string | null)[] = [null]
    // A ABI 2.9.9 encaixou `tokenType` entre o token e o errorMessage; sem este
    // desvio, a DLL nova escreveria o enum onde mora o ponteiro de erro.
    const tokenTypeOut = [0]
    const hr = await callNative(
      sdk.raw['WslcSessionAuthenticate'],
      session,
      keep.ansi(address),
      keep.ansi(username),
      keep.ansi(password),
      tokenOut,
      ...(sdk.abi.modern ? [tokenTypeOut] : []),
      errOut
    )
    if (!hrOk(hr)) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr: errOut[0] || `WslcSessionAuthenticate falhou: ${hrText(hr)}`
      }
    }
    credentials.set(address, { username, password, identityToken: tokenOut[0] ?? '' })
    logInfo('native', `Login em ${address} como ${username} (credenciais em memória)`)
    return { ok: true, code: 0, stdout: `Login em ${address} OK.`, stderr: '' }
  } catch (e) {
    return { ok: false, code: 1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }
  }
}
