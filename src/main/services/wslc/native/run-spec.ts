import type { ContainerState } from '@shared/schemas'

/**
 * Parsing puro das opções de run (formato docker) para as structs nativas.
 * Regras descobertas por probe (SDK 2.9.4): port mapping exige networking
 * BRIDGED e só TCP é implementado (UDP → E_NOTIMPL).
 */

export interface PortSpec {
  windowsPort: number
  containerPort: number
  /** 0 = TCP (único suportado pelo preview) */
  protocol: number
}

/** "8080:80" (opcional "/tcp") → PortSpec. Lança erro pt-BR para specs inválidas/UDP. */
export function parsePortSpec(spec: string): PortSpec {
  const m = spec.trim().match(/^(\d{1,5}):(\d{1,5})(?:\/(tcp|udp))?$/i)
  if (!m) throw new Error(`Porta inválida: "${spec}" (use hostPort:containerPort, ex.: 8080:80)`)
  if ((m[3] ?? 'tcp').toLowerCase() === 'udp') {
    throw new Error(`Porta "${spec}": o SDK nativo (preview) só implementa TCP — UDP retorna E_NOTIMPL`)
  }
  const windowsPort = Number(m[1])
  const containerPort = Number(m[2])
  if (windowsPort < 1 || windowsPort > 65535 || containerPort < 1 || containerPort > 65535) {
    throw new Error(`Porta fora do intervalo em "${spec}"`)
  }
  return { windowsPort, containerPort, protocol: 0 }
}

export type VolumeSpec =
  | { kind: 'bind'; windowsPath: string; containerPath: string; readOnly: boolean }
  | { kind: 'named'; name: string; containerPath: string; readOnly: boolean }

/**
 * "C:\dados:/data", "C:\dados:/data:ro" (bind) ou "meuvol:/data" (volume nomeado).
 * O caminho do container sempre começa com "/".
 */
export function parseVolumeSpec(spec: string): VolumeSpec {
  const m = spec.trim().match(/^(.+):(\/[^:]*)(?::(ro))?$/)
  if (!m || !m[1]) {
    throw new Error(`Volume inválido: "${spec}" (use C:\\pasta:/destino ou nome:/destino, opcional :ro)`)
  }
  const source = m[1]
  const containerPath = m[2]
  const readOnly = m[3] === 'ro'
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(source) || source.startsWith('\\\\')
  if (isWindowsPath) return { kind: 'bind', windowsPath: source, containerPath, readOnly }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source)) {
    throw new Error(`Volume inválido: "${spec}" — origem não é caminho do Windows nem nome de volume`)
  }
  return { kind: 'named', name: source, containerPath, readOnly }
}

/** WslcContainerState → estado da UI + rótulo pt-BR. */
export function mapNativeState(
  state: number,
  exitCode: number | null
): { state: ContainerState; status: string } {
  switch (state) {
    case 1:
      return { state: 'created', status: 'Criado' }
    case 2:
      return { state: 'running', status: 'Em execução' }
    case 3:
      return {
        state: 'exited',
        status: exitCode === null ? 'Encerrado' : `Encerrado (código ${exitCode})`
      }
    default:
      return { state: 'unknown', status: `Desconhecido (${state})` }
  }
}

/** Exibição estilo docker: "18080->80/tcp, 5432->5432/tcp". */
export function formatPortsDisplay(ports: PortSpec[]): string {
  return ports.map((p) => `${p.windowsPort}->${p.containerPort}/tcp`).join(', ')
}
