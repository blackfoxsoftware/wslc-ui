import koffi from 'koffi'
import type { RawNativeImage } from './images'

/**
 * Bindings koffi para a wslcsdk.dll (API C do WSL Containers, preview).
 *
 * Regras de marshalling validadas por probe nesta máquina:
 * 1. COM precisa estar inicializado na thread (CoInitializeEx MTA).
 * 2. As structs opacas de settings guardam ponteiros internos — devem viver
 *    em buffer nativo estável (koffi.alloc) e NUNCA ser recodificadas.
 * 3. As funções de Init/Set guardam os PONTEIROS das strings — os Buffers
 *    passados devem sobreviver até o Create* correspondente (classe Keep).
 */

// Tamanhos/alinhamentos do wslcsdk.h (opacas, alinhadas a 8 via uint64[]).
const SESSION_OPTIONS_U64 = 72 / 8
const CONTAINER_OPTIONS_U64 = 104 / 8
const PROCESS_OPTIONS_U64 = 72 / 8

export const WSLC_COMPONENT_FLAGS = {
  VIRTUAL_MACHINE_PLATFORM: 1,
  WSL_PACKAGE: 2,
  SDK_NEEDS_UPDATE: 4
} as const

/**
 * O serviço recusou a DLL por ser velha demais para o WSL instalado. Chega em
 * QUALQUER chamada, inclusive WslcGetVersion — ver bundled.ts.
 */
export const HR_SDK_UPDATE_NEEDED = '0x8004060B'

/** WslcInstallOptions — só existe na ABI 2.9.9+. REPAIR reinstala o que já está lá. */
export const WSLC_INSTALL_OPTIONS = {
  NONE: 0,
  REPAIR: 1
} as const

export interface NativeVersion {
  major: number
  minor: number
  revision: number
}

/**
 * Qual ABI da wslcsdk.dll está carregada.
 *
 * Por que isto existe: entre 2.9.3 e 2.9.9 a Microsoft mudou DUAS assinaturas
 * sem mudar nenhum tamanho de struct — `WslcSessionAuthenticate` ganhou um
 * `tokenType` ANTES do `errorMessage`, e `WslcInstallWithDependencies` ganhou
 * `components` e `options` na frente. Chamar a DLL com a aridade errada não dá
 * erro de link: passa ponteiro no lugar de enum e corrompe silenciosamente.
 *
 * E não dá para perguntar a versão ao SDK: `WslcGetVersion` devolve a versão do
 * **WSL instalado** (medido: 2.9.3 e 2.9.9 respondem igual na mesma máquina), e
 * a DLL não traz metadados de versão de arquivo. Sobra detectar por símbolo —
 * `WslcOpenContainer` só existe a partir da 2.9.9, e nasceu junto com as duas
 * assinaturas novas. É o que `modern` decide.
 *
 * Isso não é zelo teórico: a aba Sistema deixa escolher qualquer DLL do disco.
 */
export interface SdkAbi {
  /** ABI 2.9.9+ (símbolo WslcOpenContainer presente). */
  modern: boolean
  /** Rótulo curto, para a UI e o log. */
  label: string
}

/** Assinatura genérica das funções nativas vinculadas (retornam HRESULT). */
export interface NativeFn {
  (...args: unknown[]): number
  /** Executa no thread pool do koffi (não bloqueia o event loop); o último argumento é o callback (err, hr). */
  async: (...args: unknown[]) => void
}

/** Mantém Buffers/alocações vivos enquanto a struct opaca que os referencia existir. */
export class Keep {
  private readonly buffers: unknown[] = []

  wide(text: string): Buffer {
    const buf = Buffer.from(`${text}\0`, 'utf16le')
    this.buffers.push(buf)
    return buf
  }

  ansi(text: string): Buffer {
    const buf = Buffer.from(`${text}\0`, 'utf8')
    this.buffers.push(buf)
    return buf
  }

  /** Segura qualquer alocação nativa (koffi.alloc) pelo tempo de vida do Keep. */
  hold<T>(value: T): T {
    this.buffers.push(value)
    return value
  }

  /**
   * Array persistente `PCSTR const*` (argv/env): aloca void*[n] estável e grava
   * o ponteiro de cada string UTF-8 — as funções Set* guardam os ponteiros.
   */
  strArray(strings: string[]): unknown {
    const arr = this.hold(koffi.alloc(PTR, Math.max(strings.length, 1)))
    strings.forEach((s, i) => koffi.encode(arr, i * 8, PTR, this.ansi(s)))
    return arr
  }

  /** Array persistente de structs (port mappings, volumes…). */
  structArray(type: unknown, items: unknown[]): unknown {
    const t = type as Parameters<typeof koffi.sizeof>[0]
    const arr = this.hold(koffi.alloc(t, Math.max(items.length, 1)))
    items.forEach((item, i) => koffi.encode(arr, i * koffi.sizeof(t), t, item))
    return arr
  }

  /** Struct única persistente (WslcProcessCallbacks…). */
  struct(type: unknown, value: unknown): unknown {
    const t = type as Parameters<typeof koffi.sizeof>[0]
    const buf = this.hold(koffi.alloc(t, 1))
    koffi.encode(buf, t, value)
    return buf
  }
}

/**
 * Registra um callback JS chamável pelas threads internas da wslcsdk (o koffi
 * enfileira a chamada para o event loop; nossas chamadas ao SDK usam .async,
 * então o loop fica livre — sem deadlock). Devolve o ponteiro (bigint).
 */
export function registerCallback(fn: (...args: never[]) => void, proto: unknown): bigint {
  return koffi.register(fn as never, koffi.pointer(proto as Parameters<typeof koffi.sizeof>[0]))
}

export function unregisterCallback(id: bigint): void {
  koffi.unregister(id)
}

/** Copia os bytes de um ponteiro nativo (buffer dos callbacks de IO) para um Buffer JS. */
export function decodeBytes(ptr: unknown, length: number): Buffer {
  if (!ptr || length <= 0) return Buffer.alloc(0)
  return Buffer.from(koffi.decode(ptr, koffi.array('uint8', length)) as Uint8Array)
}

// eslint típico: assinaturas centralizadas em um objeto para uso nas fases seguintes.
export interface WslcSdk {
  dllPath: string
  /** ABI detectada por símbolo — ver SdkAbi. */
  abi: SdkAbi
  version(): NativeVersion
  missingComponents(): number
  /** Handles/funções cruas para as próximas fases (sessão, containers, processos, imagens). */
  raw: Record<string, NativeFn>
  types: Record<string, unknown>
  alloc: typeof koffi.alloc
  /** Decodifica o array CoTaskMemAlloc de WslcImageInfo devolvido por WslcListSessionImages. */
  decodeImages(ptr: unknown, count: number): RawNativeImage[]
  /** Decodifica a WslcImageProgressMessage recebida no callback de progresso. */
  decodeProgress(ptr: unknown): RawProgressMessage
  /** Decodifica a WslcSessionCrashDumpInfo recebida no callback de crash dump. */
  decodeCrashDump(ptr: unknown): RawCrashDump
}

/** WslcImageProgressMessage decodificada (status é o enum numérico do SDK). */
export interface RawProgressMessage {
  id: string | null
  status: number
  detail: { currentBytes: number; totalBytes: number }
}

/**
 * WslcSessionCrashDumpInfo decodificada. Por probe: dumpPath é um caminho
 * WINDOWS (%LOCALAPPDATA%\temp\wslc-crashes\*.dmp), processName vem com "/"
 * trocado por "!" ("!bin!busybox"), pid é do namespace do container e
 * timestamp é epoch em segundos.
 */
export interface RawCrashDump {
  dumpPath: string | null
  processName: string | null
  pid: number
  signal: number
  timestamp: number | bigint
}

const HR = 'int32'
const HANDLE = 'void*'
const PTR = 'void*'

let comInitialized = false
let cached: WslcSdk | null = null
let ole32Lib: ReturnType<typeof koffi.load> | null = null
let coTaskMemFreeFn: ((ptr: unknown) => void) | null = null
let waitFn: ((handle: unknown, timeoutMs: number) => number) | null = null

function ole32(): ReturnType<typeof koffi.load> {
  ole32Lib ??= koffi.load('ole32.dll')
  return ole32Lib
}

function initCom(): void {
  if (comInitialized) return
  const CoInitializeEx = ole32().func('CoInitializeEx', HR, [PTR, 'uint32'])
  // 0 = COINIT_MULTITHREADED; aceita S_OK, S_FALSE e RPC_E_CHANGED_MODE.
  // O main thread fica vivo o processo inteiro segurando o MTA — os worker
  // threads do koffi (.async) entram como membros implícitos do MTA.
  CoInitializeEx(null, 0)
  comInitialized = true
}

/** Libera memória CoTaskMemAlloc devolvida pela API (inspect, lista de imagens…). */
export function coTaskMemFree(ptr: unknown): void {
  coTaskMemFreeFn ??= ole32().func('CoTaskMemFree', 'void', [PTR]) as (ptr: unknown) => void
  coTaskMemFreeFn(ptr)
}

/** WaitForSingleObject (kernel32): 0 = sinalizado, 0x102 = timeout. */
export function waitForSingleObject(handle: unknown, timeoutMs: number): number {
  waitFn ??= koffi.load('kernel32.dll').func('WaitForSingleObject', 'uint32', [PTR, 'uint32']) as (
    handle: unknown,
    timeoutMs: number
  ) => number
  return waitFn(handle, timeoutMs)
}

export function hrOk(hr: number): boolean {
  return hr >= 0
}

export function hrHex(hr: number): string {
  return `0x${(hr >>> 0).toString(16).toUpperCase()}`
}

/**
 * HRESULTs do wslcsdk traduzidos.
 *
 * A tabela é a de `doc/docs/api-reference/c/error-codes.md` do microsoft/WSL
 * (16 códigos a partir de WSLC_E_BASE 0x0600), mais os poucos HRESULTs do
 * Windows que a gente encontra na prática. Existe porque o SDK só devolve
 * `errorMessage` em ALGUMAS chamadas: nas outras a pessoa via "0x80040610" e
 * mais nada, o que não diz o que fazer nem o que aconteceu.
 */
const HR_TEXTO: Record<string, string> = {
  '0x80040601': 'imagem não encontrada',
  '0x80040602': 'o ID informado casa com mais de um container',
  '0x80040603': 'container não encontrado',
  '0x80040604': 'volume não encontrado',
  '0x80040605': 'o container não está em execução',
  '0x80040606': 'o container está em execução',
  '0x80040607': 'nome de sessão reservado',
  '0x80040608': 'nome de sessão inválido',
  '0x80040609': 'rede não encontrada',
  '0x8004060A': 'a busca no Windows Update falhou',
  '0x8004060B': 'o SDK é mais novo que o WSL instalado — atualize o WSL ou escolha outra DLL em Sistema',
  '0x8004060C': 'o recurso de containers está desabilitado',
  '0x8004060D': 'o registry foi bloqueado por política',
  '0x8004060E': 'o volume não está disponível',
  '0x8004060F': 'sessão não encontrada',
  // Novo na 2.9.9, junto com o encerramento por ociosidade da VM da sessão.
  '0x80040610':
    'a VM da sessão não está em execução — ela é encerrada por inatividade e volta na próxima operação',
  '0x80004001': 'não implementado neste preview do SDK',
  '0x80070005': 'acesso negado',
  '0x80070032': 'não suportado (o WSL desta máquina não atende ao pedido)'
}

/** Hex + o que ele significa, quando conhecido. Para mensagem de erro na UI. */
export function hrText(hr: number): string {
  const hex = hrHex(hr)
  const texto = HR_TEXTO[hex]
  return texto === undefined ? hex : `${hex} (${texto})`
}

/**
 * Tipos koffi do wslcsdk.h, registrados UMA vez por processo.
 *
 * koffi registra struct/proto por NOME, num namespace global: repetir o
 * registro lança. Como o app pode carregar uma segunda DLL — a aba Sistema
 * sonda a candidata que a pessoa escolheu antes de adotá-la —, o registro não
 * pode morar dentro do load. Os tipos descrevem o header, não o binário, então
 * compartilhá-los entre DLLs é correto: o que muda entre 2.9.3 e 2.9.9 são
 * assinaturas de função, tratadas em SdkAbi.
 */
function buildTypes() {
  const WslcVersion = koffi.struct('WslcVersion', { major: 'uint32', minor: 'uint32', revision: 'uint32' })
  const SessionSettings = koffi.struct('WslcSessionSettings', {
    _opaque: koffi.array('uint64', SESSION_OPTIONS_U64)
  })
  const ContainerSettings = koffi.struct('WslcContainerSettings', {
    _opaque: koffi.array('uint64', CONTAINER_OPTIONS_U64)
  })
  const ProcessSettings = koffi.struct('WslcProcessSettings', {
    _opaque: koffi.array('uint64', PROCESS_OPTIONS_U64)
  })

  const VhdRequirements = koffi.struct('WslcVhdRequirements', {
    name: PTR,
    sizeBytes: 'uint64',
    type: 'int32',
    flags: 'uint32',
    uid: 'uint32',
    gid: 'uint32'
  })
  const PortMapping = koffi.struct('WslcContainerPortMapping', {
    windowsPort: 'uint16',
    containerPort: 'uint16',
    protocol: 'int32',
    windowsAddress: PTR
  })
  const ContainerVolume = koffi.struct('WslcContainerVolume', {
    windowsPath: PTR,
    containerPath: PTR,
    readOnly: 'int32'
  })
  const NamedVolume = koffi.struct('WslcContainerNamedVolume', {
    name: PTR,
    containerPath: PTR,
    readOnly: 'int32'
  })
  const ImageInfo = koffi.struct('WslcImageInfo', {
    name: koffi.array('char', 256, 'String'),
    sha256: koffi.array('uint8', 32),
    sizeBytes: 'int64',
    createdUnixTime: 'uint64'
  })
  const PullImageOptions = koffi.struct('WslcPullImageOptions', {
    uri: PTR,
    progressCallback: PTR,
    progressCallbackContext: PTR,
    registryAuth: PTR
  })
  const ImageProgressDetail = koffi.struct('WslcImageProgressDetail', {
    currentBytes: 'uint64',
    totalBytes: 'uint64'
  })
  const ImageProgressMessage = koffi.struct('WslcImageProgressMessage', {
    id: 'str',
    status: 'int32',
    detail: ImageProgressDetail
  })
  const ImportImageOptions = koffi.struct('WslcImportImageOptions', {
    progressCallback: PTR,
    progressCallbackContext: PTR
  })
  const TagImageOptions = koffi.struct('WslcTagImageOptions', { image: PTR, repo: PTR, tag: PTR })
  const PushImageOptions = koffi.struct('WslcPushImageOptions', {
    image: PTR,
    registryAuth: PTR,
    progressCallback: PTR,
    progressCallbackContext: PTR
  })
  const ProcessCallbacks = koffi.struct('WslcProcessCallbacks', { onStdOut: PTR, onStdErr: PTR, onExit: PTR })
  const CrashDumpInfo = koffi.struct('WslcSessionCrashDumpInfo', {
    dumpPath: 'str16',
    processName: 'str',
    pid: 'uint32',
    signal: 'uint32',
    timestamp: 'uint64'
  })

  // Protótipos de callbacks (registrados com koffi.register nas fases seguintes).
  const StdIOCallback = koffi.proto('WslcStdIOCallback', 'void', ['int32', PTR, 'uint32', PTR])
  const ProcessExitCallback = koffi.proto('WslcProcessExitCallback', 'void', ['int32', PTR])
  const ImageProgressCallback = koffi.proto('WslcContainerImageProgressCallback', HR, [PTR, PTR])
  const InstallCallback = koffi.proto('WslcInstallCallback', 'void', ['int32', 'uint32', 'uint32', PTR])
  const CrashDumpCallback = koffi.proto('WslcSessionCrashDumpCallback', 'void', [PTR, PTR])

  const S = koffi.pointer(SessionSettings)
  const C = koffi.pointer(ContainerSettings)
  const P = koffi.pointer(ProcessSettings)
  const outHandle = koffi.out(koffi.pointer(HANDLE))
  const outErr = koffi.out(koffi.pointer('str16'))
  return {
    WslcVersion,
    SessionSettings,
    ContainerSettings,
    ProcessSettings,
    VhdRequirements,
    PortMapping,
    ContainerVolume,
    NamedVolume,
    ImageInfo,
    PullImageOptions,
    ImageProgressDetail,
    ImageProgressMessage,
    ImportImageOptions,
    TagImageOptions,
    PushImageOptions,
    ProcessCallbacks,
    CrashDumpInfo,
    StdIOCallback,
    ProcessExitCallback,
    ImageProgressCallback,
    InstallCallback,
    CrashDumpCallback,
    S,
    C,
    P,
    outHandle,
    outErr
  }
}

type SdkTypes = ReturnType<typeof buildTypes>

let sdkTypes: SdkTypes | null = null

function types(): SdkTypes {
  sdkTypes ??= buildTypes()
  return sdkTypes
}

/** Vincula toda a superfície do wslcsdk.h a partir de uma DLL, sem cache. */
function build(dllPath: string): { sdk: WslcSdk; lib: ReturnType<typeof koffi.load> } {
  initCom()

  const lib = koffi.load(dllPath)

  const t = types()
  // Só o que este corpo usa; o registro completo vai em `sdk.types`, de
  // onde as fases nativas puxam os protótipos de callback.
  const {
    WslcVersion,
    VhdRequirements,
    PortMapping,
    ContainerVolume,
    NamedVolume,
    ImageInfo,
    PullImageOptions,
    ImageProgressMessage,
    ImportImageOptions,
    TagImageOptions,
    PushImageOptions,
    ProcessCallbacks,
    CrashDumpInfo,
    InstallCallback,
    CrashDumpCallback,
    S,
    C,
    P,
    outHandle,
    outErr
  } = t

  /** Vincula um símbolo opcional; devolve null se ele não existir nesta DLL. */
  const optional = (name: string, ret: string, args: unknown[]): NativeFn | null => {
    try {
      return lib.func(name, ret, args as never[]) as NativeFn
    } catch {
      return null
    }
  }

  // Sonda da ABI — ver SdkAbi. WslcOpenContainer é o marcador da 2.9.9.
  const openContainer = optional('WslcOpenContainer', HR, [HANDLE, PTR, outHandle, outErr])
  const setInitProcessIO = optional('WslcSetContainerInitProcessIOCallbacks', HR, [
    HANDLE,
    koffi.pointer(ProcessCallbacks),
    PTR
  ])
  const abi: SdkAbi = openContainer ? { modern: true, label: '2.9.9+' } : { modern: false, label: '2.9.3' }

  const raw: Record<string, NativeFn> = {
    // Instalação / versão
    WslcGetVersion: lib.func('WslcGetVersion', HR, [koffi.out(koffi.pointer(WslcVersion))]),
    WslcGetMissingComponents: lib.func('WslcGetMissingComponents', HR, [koffi.out(koffi.pointer('uint32'))]),
    // 2.9.9 pôs `components` e `options` na frente (ver SdkAbi).
    WslcInstallWithDependencies: abi.modern
      ? lib.func('WslcInstallWithDependencies', HR, ['int32', 'int32', koffi.pointer(InstallCallback), PTR])
      : lib.func('WslcInstallWithDependencies', HR, [koffi.pointer(InstallCallback), PTR]),

    // Sessão
    WslcInitSessionSettings: lib.func('WslcInitSessionSettings', HR, [PTR, PTR, S]),
    WslcSetSessionSettingsCpuCount: lib.func('WslcSetSessionSettingsCpuCount', HR, [S, 'uint32']),
    WslcSetSessionSettingsMemory: lib.func('WslcSetSessionSettingsMemory', HR, [S, 'uint32']),
    WslcSetSessionSettingsTimeout: lib.func('WslcSetSessionSettingsTimeout', HR, [S, 'uint32']),
    WslcSetSessionSettingsVhd: lib.func('WslcSetSessionSettingsVhd', HR, [S, koffi.pointer(VhdRequirements)]),
    WslcSetSessionSettingsFeatureFlags: lib.func('WslcSetSessionSettingsFeatureFlags', HR, [S, 'int32']),
    WslcCreateSession: lib.func('WslcCreateSession', HR, [S, outHandle, outErr]),
    WslcGetSessionTerminationEvent: lib.func('WslcGetSessionTerminationEvent', HR, [
      HANDLE,
      koffi.out(koffi.pointer(HANDLE))
    ]),
    WslcGetSessionTerminationReason: lib.func('WslcGetSessionTerminationReason', HR, [
      HANDLE,
      koffi.out(koffi.pointer('int32'))
    ]),
    WslcTerminateSession: lib.func('WslcTerminateSession', HR, [HANDLE]),
    WslcReleaseSession: lib.func('WslcReleaseSession', HR, [HANDLE]),
    WslcRegisterSessionCrashDumpCallback: lib.func('WslcRegisterSessionCrashDumpCallback', HR, [
      HANDLE,
      koffi.pointer(CrashDumpCallback),
      PTR,
      koffi.out(koffi.pointer(HANDLE)),
      outErr
    ]),
    WslcReleaseCrashDumpSubscription: lib.func('WslcReleaseCrashDumpSubscription', HR, [HANDLE]),
    // 2.9.9 encaixou `tokenType` ANTES do errorMessage (ver SdkAbi).
    WslcSessionAuthenticate: abi.modern
      ? lib.func('WslcSessionAuthenticate', HR, [
          HANDLE,
          PTR,
          PTR,
          PTR,
          koffi.out(koffi.pointer('str')),
          koffi.out(koffi.pointer('int32')),
          outErr
        ])
      : lib.func('WslcSessionAuthenticate', HR, [
          HANDLE,
          PTR,
          PTR,
          PTR,
          koffi.out(koffi.pointer('str')),
          outErr
        ]),

    // Container
    WslcInitContainerSettings: lib.func('WslcInitContainerSettings', HR, [PTR, C]),
    WslcSetContainerSettingsName: lib.func('WslcSetContainerSettingsName', HR, [C, PTR]),
    WslcSetContainerSettingsInitProcess: lib.func('WslcSetContainerSettingsInitProcess', HR, [C, P]),
    WslcSetContainerSettingsNetworkingMode: lib.func('WslcSetContainerSettingsNetworkingMode', HR, [
      C,
      'int32'
    ]),
    WslcSetContainerSettingsHostName: lib.func('WslcSetContainerSettingsHostName', HR, [C, PTR]),
    WslcSetContainerSettingsDomainName: lib.func('WslcSetContainerSettingsDomainName', HR, [C, PTR]),
    WslcSetContainerSettingsFlags: lib.func('WslcSetContainerSettingsFlags', HR, [C, 'int32']),
    WslcSetContainerSettingsPortMappings: lib.func('WslcSetContainerSettingsPortMappings', HR, [
      C,
      koffi.pointer(PortMapping),
      'uint32'
    ]),
    WslcSetContainerSettingsVolumes: lib.func('WslcSetContainerSettingsVolumes', HR, [
      C,
      koffi.pointer(ContainerVolume),
      'uint32'
    ]),
    WslcSetContainerSettingsNamedVolumes: lib.func('WslcSetContainerSettingsNamedVolumes', HR, [
      C,
      koffi.pointer(NamedVolume),
      'uint32'
    ]),
    WslcCreateContainer: lib.func('WslcCreateContainer', HR, [HANDLE, C, outHandle, outErr]),
    // Só existem na ABI 2.9.9+; quem usa precisa checar sdk.abi.modern antes.
    ...(openContainer === null ? {} : { WslcOpenContainer: openContainer }),
    ...(setInitProcessIO === null ? {} : { WslcSetContainerInitProcessIOCallbacks: setInitProcessIO }),
    WslcStartContainer: lib.func('WslcStartContainer', HR, [HANDLE, 'int32', outErr]),
    WslcCreateContainerProcess: lib.func('WslcCreateContainerProcess', HR, [HANDLE, P, outHandle, outErr]),
    // Recebe um Buffer.alloc(65) — o ID (64 hex + NUL) é escrito nele.
    WslcGetContainerID: lib.func('WslcGetContainerID', HR, [HANDLE, PTR]),
    WslcGetContainerInitProcess: lib.func('WslcGetContainerInitProcess', HR, [
      HANDLE,
      koffi.out(koffi.pointer(HANDLE))
    ]),
    WslcInspectContainer: lib.func('WslcInspectContainer', HR, [HANDLE, koffi.out(koffi.pointer('str'))]),
    WslcGetContainerState: lib.func('WslcGetContainerState', HR, [HANDLE, koffi.out(koffi.pointer('int32'))]),
    WslcStopContainer: lib.func('WslcStopContainer', HR, [HANDLE, 'int32', 'uint32', outErr]),
    WslcDeleteContainer: lib.func('WslcDeleteContainer', HR, [HANDLE, 'int32', outErr]),
    WslcReleaseContainer: lib.func('WslcReleaseContainer', HR, [HANDLE]),

    // Processo
    WslcInitProcessSettings: lib.func('WslcInitProcessSettings', HR, [P]),
    WslcSetProcessSettingsWorkingDirectory: lib.func('WslcSetProcessSettingsWorkingDirectory', HR, [P, PTR]),
    WslcSetProcessSettingsCmdLine: lib.func('WslcSetProcessSettingsCmdLine', HR, [P, PTR, 'size_t']),
    WslcSetProcessSettingsEnvVariables: lib.func('WslcSetProcessSettingsEnvVariables', HR, [
      P,
      PTR,
      'size_t'
    ]),
    WslcSetProcessSettingsCallbacks: lib.func('WslcSetProcessSettingsCallbacks', HR, [
      P,
      koffi.pointer(ProcessCallbacks),
      PTR
    ]),
    WslcGetProcessPid: lib.func('WslcGetProcessPid', HR, [HANDLE, koffi.out(koffi.pointer('uint32'))]),
    WslcGetProcessExitEvent: lib.func('WslcGetProcessExitEvent', HR, [
      HANDLE,
      koffi.out(koffi.pointer(HANDLE))
    ]),
    WslcGetProcessState: lib.func('WslcGetProcessState', HR, [HANDLE, koffi.out(koffi.pointer('int32'))]),
    WslcGetProcessExitCode: lib.func('WslcGetProcessExitCode', HR, [
      HANDLE,
      koffi.out(koffi.pointer('int32'))
    ]),
    WslcSignalProcess: lib.func('WslcSignalProcess', HR, [HANDLE, 'int32']),
    WslcGetProcessIOHandle: lib.func('WslcGetProcessIOHandle', HR, [
      HANDLE,
      'int32',
      koffi.out(koffi.pointer(HANDLE))
    ]),
    WslcReleaseProcess: lib.func('WslcReleaseProcess', HR, [HANDLE]),

    // Imagens
    WslcPullSessionImage: lib.func('WslcPullSessionImage', HR, [
      HANDLE,
      koffi.pointer(PullImageOptions),
      outErr
    ]),
    WslcImportSessionImageFromFile: lib.func('WslcImportSessionImageFromFile', HR, [
      HANDLE,
      PTR,
      PTR,
      koffi.pointer(ImportImageOptions),
      outErr
    ]),
    WslcLoadSessionImageFromFile: lib.func('WslcLoadSessionImageFromFile', HR, [
      HANDLE,
      PTR,
      koffi.pointer(ImportImageOptions),
      outErr
    ]),
    WslcDeleteSessionImage: lib.func('WslcDeleteSessionImage', HR, [HANDLE, PTR, outErr]),
    WslcTagSessionImage: lib.func('WslcTagSessionImage', HR, [
      HANDLE,
      koffi.pointer(TagImageOptions),
      outErr
    ]),
    WslcPushSessionImage: lib.func('WslcPushSessionImage', HR, [
      HANDLE,
      koffi.pointer(PushImageOptions),
      outErr
    ]),
    WslcListSessionImages: lib.func('WslcListSessionImages', HR, [
      HANDLE,
      koffi.out(koffi.pointer(PTR)),
      koffi.out(koffi.pointer('uint32'))
    ]),

    // Armazenamento
    WslcCreateSessionVhdVolume: lib.func('WslcCreateSessionVhdVolume', HR, [
      HANDLE,
      koffi.pointer(VhdRequirements),
      outErr
    ]),
    WslcDeleteSessionVhdVolume: lib.func('WslcDeleteSessionVhdVolume', HR, [HANDLE, PTR, outErr])
  }

  const sdk: WslcSdk = {
    dllPath,
    abi,
    version: () => {
      const out: Partial<NativeVersion> = {}
      const hr = raw['WslcGetVersion'](out)
      if (!hrOk(hr)) throw new Error(`WslcGetVersion falhou: ${hrHex(hr)}`)
      return out as NativeVersion
    },
    missingComponents: () => {
      const out = [0]
      const hr = raw['WslcGetMissingComponents'](out)
      if (!hrOk(hr)) throw new Error(`WslcGetMissingComponents falhou: ${hrHex(hr)}`)
      return out[0]
    },
    raw,
    decodeImages: (ptr, count) => koffi.decode(ptr, koffi.array(ImageInfo, count)) as RawNativeImage[],
    decodeProgress: (ptr) => koffi.decode(ptr, ImageProgressMessage) as RawProgressMessage,
    decodeCrashDump: (ptr) => koffi.decode(ptr, CrashDumpInfo) as RawCrashDump,
    types: t,
    alloc: koffi.alloc
  }
  return { sdk, lib }
}

/** Carrega a DLL em uso. Idempotente por caminho. */
export function loadWslcSdk(dllPath: string): WslcSdk {
  if (cached && cached.dllPath === dllPath) return cached
  const { sdk } = build(dllPath)
  cached = sdk
  return sdk
}

/**
 * Carrega uma DLL CANDIDATA sem tocar no cache — é o que a aba Sistema usa
 * para ler versão e ABI de um arquivo escolhido antes de adotá-lo.
 *
 * O `unload` recusa descarregar a DLL em uso: a sessão nativa viva tem handles
 * dela, e puxar o tapete derrubaria o app. Sondar a que já está carregada é o
 * caso comum (a pessoa reabre o diálogo e escolhe a mesma), então isso não é
 * hipótese remota.
 */
export function probeWslcSdk(dllPath: string): { sdk: WslcSdk; unload: () => void } {
  const { sdk, lib } = build(dllPath)
  return {
    sdk,
    unload: () => {
      if (cached?.dllPath !== dllPath) lib.unload()
    }
  }
}
