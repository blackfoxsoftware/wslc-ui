import { z } from 'zod'

/**
 * Schemas Zod do domínio — fonte única de verdade dos tipos que cruzam a
 * ponte IPC. Os tipos TypeScript são inferidos daqui (z.infer), nunca
 * declarados à mão.
 */

export const containerStateSchema = z.enum(['running', 'exited', 'created', 'unknown'])

export const environmentSchema = z.object({
  wslInstalled: z.boolean(),
  wslVersion: z.string().nullable(),
  /** WSL >= 2.9.3 (pré-release) */
  wslVersionOk: z.boolean(),
  wslcAvailable: z.boolean(),
  wslcVersion: z.string().nullable(),
  /** WSL >= 2.9.3 e wslc.exe disponível */
  ready: z.boolean()
})

export const containerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  command: z.string(),
  created: z.string(),
  status: z.string(),
  state: containerStateSchema,
  ports: z.string()
})

export const imageSchema = z.object({
  repository: z.string(),
  tag: z.string(),
  id: z.string(),
  created: z.string(),
  size: z.string()
})

export const volumeSchema = z.object({
  name: z.string(),
  driver: z.string(),
  mountpoint: z.string(),
  scope: z.string(),
  /** Tamanho do arquivo .vhdx (só volumes VHD da sessão nativa). */
  sizeBytes: z.number().int().nonnegative().optional()
})

/** Opções do volume VHD nativo (WslcCreateSessionVhdVolume). */
export const vhdVolumeOptionsSchema = z.object({
  sizeMb: z.number().int().positive(),
  fixed: z.boolean(),
  /** uid/gid do dono dentro do container (root:root quando ausente). */
  owner: z.object({ uid: z.number().int().nonnegative(), gid: z.number().int().nonnegative() }).optional()
})

export const commandResultSchema = z.object({
  ok: z.boolean(),
  code: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string()
})

/** Uma rede do `wslc network list --format json` (recurso da CLI). */
export const networkSchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string()
})

export const createNetworkOptionsSchema = z.object({
  name: z.string().min(1),
  /** padrão da CLI: bridge */
  driver: z.string().optional(),
  /** CIDR, ex.: 172.20.0.0/16 */
  subnet: z.string().optional(),
  gateway: z.string().optional(),
  /** --internal: sem acesso externo */
  internal: z.boolean().optional(),
  /** pares chave=valor (-l) */
  labels: z.array(z.string()).optional(),
  /** opções do driver (-o chave=valor) */
  options: z.array(z.string()).optional()
})

/** Uma linha do `wslc system session list` (id e PID são numéricos na tabela). */
export const wslcSessionSchema = z.object({
  id: z.string(),
  creatorPid: z.string(),
  displayName: z.string()
})

/**
 * Tuning da sessão nativa (WslcSetSessionSettings*): aplicado quando a sessão
 * é (re)criada — mudar exige reiniciar a sessão. Campos ausentes = padrão do WSL.
 */
export const nativeTuningSchema = z.object({
  cpuCount: z.number().int().positive().optional(),
  memoryMb: z.number().int().positive().optional(),
  vhdSizeMb: z.number().int().positive().optional(),
  /** WSLC_SESSION_FEATURE_FLAG_ENABLE_GPU */
  gpu: z.boolean().optional()
})

export const containerActionSchema = z.enum(['start', 'stop', 'restart', 'remove'])

/** Healthcheck do `wslc run` (--health-*; só no motor CLI). */
export const runHealthOptionsSchema = z.object({
  cmd: z.string().optional(),
  /** ex.: "30s", "1m30s" */
  interval: z.string().optional(),
  retries: z.number().int().positive().optional(),
  startPeriod: z.string().optional(),
  timeout: z.string().optional(),
  /** --no-healthcheck */
  disable: z.boolean().optional()
})

export const runContainerOptionsSchema = z.object({
  image: z.string().min(1),
  name: z.string().optional(),
  /** ex.: ["8080:80", "3000:3000"] */
  ports: z.array(z.string()).optional(),
  /** ex.: ["TZ=Etc/UTC"] */
  env: z.array(z.string()).optional(),
  /** ex.: ["C:\\dados:/data"] */
  volumes: z.array(z.string()).optional(),
  detach: z.boolean(),
  rm: z.boolean(),
  gpus: z.boolean().optional(),
  /** comando opcional após a imagem, ex.: "nginx -g 'daemon off;'" */
  command: z.string().optional(),
  // --- extras (cobertura completa do `wslc run`) ---
  /** nos dois motores (nativo: WslcSetContainerSettingsHostName) */
  hostname: z.string().optional(),
  domainname: z.string().optional(),
  /** nos dois motores (nativo: WslcSetProcessSettingsWorkingDirectory) */
  workdir: z.string().optional(),
  /** executável do init (--entrypoint; no nativo, prefixa o comando) */
  entrypoint: z.string().optional(),
  // --- só no motor CLI (o SDK preview não tem equivalentes) ---
  network: z.string().optional(),
  networkAliases: z.array(z.string()).optional(),
  /** -P: publica todas as portas expostas em portas aleatórias */
  publishAll: z.boolean().optional(),
  user: z.string().optional(),
  /** ex.: "0.5", "2" */
  cpus: z.string().optional(),
  /** ex.: "512M", "1G" */
  memory: z.string().optional(),
  envFile: z.string().optional(),
  /** pares chave=valor (-l) */
  labels: z.array(z.string()).optional(),
  dns: z.array(z.string()).optional(),
  dnsSearch: z.array(z.string()).optional(),
  dnsOptions: z.array(z.string()).optional(),
  /** ex.: "64M" */
  shmSize: z.string().optional(),
  /** caminhos de montagem tmpfs, ex.: ["/cache"] */
  tmpfs: z.array(z.string()).optional(),
  /** ex.: ["nofile=1024:2048"] */
  ulimits: z.array(z.string()).optional(),
  stopSignal: z.string().optional(),
  /** segundos (-1 = sem timeout) */
  stopTimeout: z.number().int().optional(),
  health: runHealthOptionsSchema.optional()
})

/** Uma linha do `wslc stats --no-stream`. */
export const containerStatsSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** percentual 0–100 (ou mais, multi-core) */
  cpuPercent: z.number(),
  /** ex.: "24.5MiB / 4GiB" */
  memUsage: z.string(),
  /** percentual 0–100 */
  memPercent: z.number(),
  netIO: z.string(),
  blockIO: z.string()
})

/** De onde saiu a wslcsdk.dll em uso, na ordem de precedência do locate. */
export const sdkSourceSchema = z.enum(['env', 'custom', 'bundled', 'system'])

/** Estado da API nativa (wslcsdk.dll via FFI). */
export const nativeStatusSchema = z.object({
  available: z.boolean(),
  dllPath: z.string().nullable(),
  source: sdkSourceSchema.nullable(),
  /**
   * Versão do WSL **instalado**, como o SDK a reporta. NÃO é a versão da DLL:
   * WslcGetVersion devolve o mesmo número para binários diferentes (medido com
   * 2.9.3 e 2.9.9 na mesma máquina), e a DLL não traz metadados de arquivo.
   */
  wslVersion: z.string().nullable(),
  /** ABI detectada por símbolo — '2.9.9+' ou '2.9.3'. Ver SdkAbi. */
  abi: z.string().nullable(),
  /** Tamanho da DLL: o único jeito barato de distinguir dois binários. */
  sizeBytes: z.number().nullable(),
  missingComponents: z.array(z.string()),
  detail: z.string()
})

/**
 * Resultado de sondar uma wslcsdk.dll candidata, escolhida na aba Sistema.
 *
 * A sonda carrega a DLL num binding próprio, lê o que ela sabe dizer e a
 * descarrega — sem trocar a que está em uso, que só muda ao reabrir o app.
 */
export const sdkProbeSchema = z.object({
  path: z.string(),
  /** false = não é uma wslcsdk.dll utilizável (não carregou, faltam símbolos). */
  ok: z.boolean(),
  /** Versão do WSL instalado, como ESTA DLL a reporta. */
  wslVersion: z.string().nullable(),
  abi: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  /** Identidade forte do binário — a única forma de distinguir duas DLLs. */
  sha256: z.string().nullable(),
  missingComponents: z.array(z.string()),
  detail: z.string()
})

/** Motor de execução: CLI (wslc.exe) ou API nativa (wslcsdk.dll via FFI). */
export const engineSchema = z.enum(['cli', 'native'])

export const engineStatusSchema = z.object({
  engine: engineSchema,
  /** true se a sessão nativa do app está ativa neste momento */
  sessionActive: z.boolean(),
  detail: z.string()
})

/** A sessão nativa terminou por fora (WSL desligado, crash…). */
export const nativeSessionEndedEventSchema = z.object({
  reason: z.enum(['shutdown', 'crashed', 'unknown'])
})

/** Um processo Linux gerou crash dump na sessão nativa (Fase 6). */
export const nativeCrashDumpEventSchema = z.object({
  /** Caminho Windows do .dmp (%LOCALAPPDATA%\temp\wslc-crashes). */
  dumpPath: z.string(),
  /** Caminho do executável dentro do container (ex.: /bin/busybox). */
  processName: z.string(),
  /** PID no namespace do container. */
  pid: z.number().int().nonnegative(),
  signal: z.number().int().nonnegative(),
  /** Nome amigável do sinal ("SIGSEGV") derivado do número. */
  signalName: z.string(),
  /** epoch em SEGUNDOS (validado por probe). */
  timestamp: z.number()
})

/** Progresso da instalação guiada (WslcInstallWithDependencies). */
export const installProgressEventSchema = z.object({
  component: z.string(),
  step: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
})

/** Resultado de busca no Docker Hub. */
export const registryImageSchema = z.object({
  name: z.string(),
  description: z.string(),
  stars: z.number(),
  official: z.boolean()
})

export const buildImageOptionsSchema = z.object({
  /** nome:tag da imagem resultante */
  tag: z.string().min(1),
  /** pasta de contexto do build (contém o Containerfile) */
  context: z.string().min(1),
  /** caminho do Containerfile/Dockerfile, se não for o padrão */
  file: z.string().optional()
})

export const windowStateEventSchema = z.object({
  maximized: z.boolean()
})

export const streamDataEventSchema = z.object({
  id: z.number().int(),
  chunk: z.string()
})

export const streamExitEventSchema = z.object({
  id: z.number().int(),
  code: z.number().int().nullable()
})

/**
 * Estágio de uma camada durante pull/push nativo (WslcImageProgressStatus).
 * 'uploading' não vem do SDK: o push manda status 0 sempre — é derivado dos
 * bytes pelo ProgressTracker em modo push.
 */
export const imageProgressStatusSchema = z.enum([
  'unknown',
  'pulling',
  'waiting',
  'downloading',
  'verifying',
  'extracting',
  'complete',
  'uploading'
])

export const imageProgressLayerSchema = z.object({
  id: z.string(),
  status: imageProgressStatusSchema,
  /** Bytes já processados / total esperado (0 quando o SDK não informa). */
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
})

/** Snapshot do progresso estruturado de um stream (pull nativo por camada). */
export const streamProgressEventSchema = z.object({
  id: z.number().int(),
  layers: z.array(imageProgressLayerSchema)
})

/** Saída do terminal embutido (bytes do shell dentro do container). */
export const terminalDataEventSchema = z.object({
  id: z.number().int(),
  chunk: z.string()
})

/** O shell do terminal embutido terminou. */
export const terminalExitEventSchema = z.object({
  id: z.number().int(),
  code: z.number().int().nullable()
})

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export const logCategorySchema = z.enum(['app', 'ipc', 'cli', 'native', 'engine', 'stream', 'terminal'])

/** Uma entrada do sistema de logs do app (processo main). */
export const logEntrySchema = z.object({
  id: z.number().int().positive(),
  /** epoch ms */
  ts: z.number(),
  level: logLevelSchema,
  category: logCategorySchema,
  message: z.string(),
  /** stderr, stack trace ou payload associado (truncado) */
  detail: z.string().optional()
})

export type ContainerState = z.infer<typeof containerStateSchema>
export type WslcEnvironment = z.infer<typeof environmentSchema>
export type ContainerInfo = z.infer<typeof containerSchema>
export type ImageInfo = z.infer<typeof imageSchema>
export type VolumeInfo = z.infer<typeof volumeSchema>
export type NetworkInfo = z.infer<typeof networkSchema>
export type CreateNetworkOptions = z.infer<typeof createNetworkOptionsSchema>
export type WslcSessionInfo = z.infer<typeof wslcSessionSchema>
export type NativeTuning = z.infer<typeof nativeTuningSchema>
export type RunHealthOptions = z.infer<typeof runHealthOptionsSchema>
export type VhdVolumeOptions = z.infer<typeof vhdVolumeOptionsSchema>
export type CommandResult = z.infer<typeof commandResultSchema>
export type ContainerAction = z.infer<typeof containerActionSchema>
export type RunContainerOptions = z.infer<typeof runContainerOptionsSchema>
export type StreamDataEvent = z.infer<typeof streamDataEventSchema>
export type StreamExitEvent = z.infer<typeof streamExitEventSchema>
export type ImageProgressStatus = z.infer<typeof imageProgressStatusSchema>
export type ImageProgressLayer = z.infer<typeof imageProgressLayerSchema>
export type StreamProgressEvent = z.infer<typeof streamProgressEventSchema>
export type TerminalDataEvent = z.infer<typeof terminalDataEventSchema>
export type TerminalExitEvent = z.infer<typeof terminalExitEventSchema>
export type LogLevel = z.infer<typeof logLevelSchema>
export type LogCategory = z.infer<typeof logCategorySchema>
export type LogEntry = z.infer<typeof logEntrySchema>
export type WindowStateEvent = z.infer<typeof windowStateEventSchema>
export type ContainerStats = z.infer<typeof containerStatsSchema>
export type BuildImageOptions = z.infer<typeof buildImageOptionsSchema>
export type RegistryImage = z.infer<typeof registryImageSchema>
export type NativeStatus = z.infer<typeof nativeStatusSchema>
export type SdkSource = z.infer<typeof sdkSourceSchema>
export type SdkProbe = z.infer<typeof sdkProbeSchema>
export type Engine = z.infer<typeof engineSchema>
export type EngineStatus = z.infer<typeof engineStatusSchema>
export type NativeSessionEndedEvent = z.infer<typeof nativeSessionEndedEventSchema>
export type NativeCrashDumpEvent = z.infer<typeof nativeCrashDumpEventSchema>
export type InstallProgressEvent = z.infer<typeof installProgressEventSchema>
