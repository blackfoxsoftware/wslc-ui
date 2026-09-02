import { z } from 'zod'
import {
  buildImageOptionsSchema,
  commandResultSchema,
  containerActionOptionsSchema,
  containerActionSchema,
  containerCopyOptionsSchema,
  containerLogsOptionsSchema,
  containerSchema,
  containerStatsSchema,
  connectNetworkOptionsSchema,
  createNetworkOptionsSchema,
  engineSchema,
  engineStatusSchema,
  environmentSchema,
  execOptionsSchema,
  imageSchema,
  installProgressEventSchema,
  logEntrySchema,
  nativeCrashDumpEventSchema,
  nativeSessionEndedEventSchema,
  nativeStatusSchema,
  nativeTuningSchema,
  networkSchema,
  registryImageSchema,
  removeImageOptionsSchema,
  runContainerOptionsSchema,
  sdkProbeSchema,
  streamDataEventSchema,
  streamExitEventSchema,
  streamProgressEventSchema,
  terminalDataEventSchema,
  terminalExitEventSchema,
  updateStatusSchema,
  vhdVolumeOptionsSchema,
  volumeSchema,
  windowStateEventSchema,
  wslcSessionSchema
} from '../schemas'

/**
 * Contrato IPC tipado de ponta a ponta.
 *
 * Cada canal invoke declara o schema Zod do payload de entrada e da resposta.
 * O processo main valida os dois lados (`router.ts`); o preload valida os
 * payloads de eventos recebidos. Nenhum dado cruza a ponte sem passar por um
 * `parse` — um payload malformado falha na fronteira, não no meio da UI.
 */

const streamIdSchema = z.number().int().positive()

export const invokeContract = {
  'env:get': { input: z.void(), output: environmentSchema },

  'containers:list': { input: z.object({ all: z.boolean() }), output: z.array(containerSchema) },
  'containers:action': {
    input: z.object({
      action: containerActionSchema,
      id: z.string().min(1),
      /** stop: sinal e espera; remove: forçar e volumes anônimos. */
      options: containerActionOptionsSchema.optional()
    }),
    output: commandResultSchema
  },
  'containers:prune': { input: z.void(), output: commandResultSchema },
  'containers:run': { input: runContainerOptionsSchema, output: commandResultSchema },
  'containers:exec': {
    input: z.object({
      id: z.string().min(1),
      command: z.string().min(1),
      options: execOptionsSchema.optional()
    }),
    output: commandResultSchema
  },
  // As opções de log são da CLI; o motor nativo ignora e sempre acompanha
  // desde o começo (o SDK entrega o log por callback, sem recorte).
  'containers:logs': {
    input: z.object({ id: z.string().min(1), options: containerLogsOptionsSchema.optional() }),
    output: streamIdSchema
  },
  'containers:stats': { input: z.void(), output: z.array(containerStatsSchema) },
  'containers:inspect': { input: z.object({ id: z.string().min(1) }), output: commandResultSchema },
  'containers:open-terminal': { input: z.object({ id: z.string().min(1) }), output: z.void() },
  // Cobertura completa da CLI: kill (sinal imediato) e export do filesystem (tar).
  'containers:kill': {
    input: z.object({ id: z.string().min(1), signal: z.string().optional() }),
    output: commandResultSchema
  },
  'containers:export': {
    input: z.object({ id: z.string().min(1), path: z.string().min(1) }),
    output: commandResultSchema
  },
  // `container cp` (2.9.8): copiar arquivos host ↔ container. Não existe API
  // de cópia no SDK — a UI esconde a ação quando o motor é nativo.
  'containers:copy': { input: containerCopyOptionsSchema, output: commandResultSchema },

  'images:list': { input: z.void(), output: z.array(imageSchema) },
  'images:pull': { input: z.object({ ref: z.string().min(1) }), output: streamIdSchema },
  'images:remove': {
    input: z.object({ ref: z.string().min(1), options: removeImageOptionsSchema.optional() }),
    output: commandResultSchema
  },
  'images:prune': { input: z.void(), output: commandResultSchema },
  'images:inspect': { input: z.object({ ref: z.string().min(1) }), output: commandResultSchema },
  'images:tag': {
    input: z.object({ source: z.string().min(1), target: z.string().min(1) }),
    output: commandResultSchema
  },
  'images:push': { input: z.object({ ref: z.string().min(1) }), output: streamIdSchema },
  'images:build': { input: buildImageOptionsSchema, output: streamIdSchema },
  // Fase 4: tarballs — save via CLI; load/import nativos ou via CLI, por motor.
  'images:save': {
    input: z.object({ ref: z.string().min(1), path: z.string().min(1) }),
    output: commandResultSchema
  },
  'images:load': { input: z.object({ path: z.string().min(1) }), output: streamIdSchema },
  'images:import': {
    input: z.object({ path: z.string().min(1), ref: z.string().min(1) }),
    output: streamIdSchema
  },
  'images:search-registry': {
    input: z.object({ query: z.string().min(2) }),
    output: z.array(registryImageSchema)
  },
  // Fase 5: login em registry — nativo via WslcSessionAuthenticate (credenciais
  // guardadas em memória para push/pull); CLI via `wslc login --password-stdin`.
  'registry:login': {
    input: z.object({
      /** Vazio = Docker Hub (index.docker.io). */
      server: z.string(),
      username: z.string().min(1),
      password: z.string().min(1)
    }),
    output: commandResultSchema
  },

  'registry:logout': { input: z.object({ server: z.string() }), output: commandResultSchema },

  'volumes:list': { input: z.void(), output: z.array(volumeSchema) },
  // `vhd` só vale no motor nativo (WslcCreateSessionVhdVolume); a CLI ignora.
  'volumes:create': {
    input: z.object({
      name: z.string().min(1),
      vhd: vhdVolumeOptionsSchema.optional(),
      /** -l: pares chave=valor (só na CLI; o SDK não guarda labels). */
      labels: z.array(z.string()).optional()
    }),
    output: commandResultSchema
  },
  // `force` aqui é o -f da CLI: NÃO é remoção forçada, é "não erre se não
  // existir" — serve para a remoção em massa não contar corrida como falha.
  'volumes:remove': {
    input: z.object({ name: z.string().min(1), force: z.boolean().optional() }),
    output: commandResultSchema
  },
  'volumes:prune': { input: z.void(), output: commandResultSchema },
  'volumes:inspect': { input: z.object({ name: z.string().min(1) }), output: commandResultSchema },

  // Redes (recurso da CLI — o SDK nativo só tem NONE/BRIDGED; containers
  // nativos não participam destas redes).
  'networks:list': { input: z.void(), output: z.array(networkSchema) },
  'networks:create': { input: createNetworkOptionsSchema, output: commandResultSchema },
  /** `force` = o -f da CLI: idempotência (não erra se a rede não existir). */
  'networks:remove': {
    input: z.object({ name: z.string().min(1), force: z.boolean().optional() }),
    output: commandResultSchema
  },
  // ATENÇÃO: `network prune` NÃO aceita --force (o -f dele é --filter) e roda
  // sem confirmação — a confirmação fica na UI.
  'networks:prune': { input: z.void(), output: commandResultSchema },
  'networks:inspect': { input: z.object({ name: z.string().min(1) }), output: commandResultSchema },
  'networks:connect': { input: connectNetworkOptionsSchema, output: commandResultSchema },
  'networks:disconnect': {
    input: z.object({ network: z.string().min(1), container: z.string().min(1) }),
    output: commandResultSchema
  },

  'system:terminate-session': { input: z.void(), output: commandResultSchema },
  'system:native-status': { input: z.void(), output: nativeStatusSchema },
  'system:get-engine': { input: z.void(), output: engineStatusSchema },
  'system:set-engine': { input: z.object({ engine: engineSchema }), output: engineStatusSchema },
  'system:reset-native': { input: z.void(), output: commandResultSchema },
  'system:pick-directory': { input: z.void(), output: z.string().nullable() },
  'system:pick-file': {
    input: z.object({ title: z.string().min(1), extensions: z.array(z.string().min(1)).min(1) }),
    output: z.string().nullable()
  },
  'system:pick-save': {
    input: z.object({
      title: z.string().min(1),
      defaultName: z.string().min(1),
      extensions: z.array(z.string().min(1)).min(1)
    }),
    output: z.string().nullable()
  },
  'system:open-external': {
    input: z.object({ url: z.string().regex(/^https?:\/\/\S+$/) }),
    output: z.void()
  },
  // Fase 6: instalação guiada dos componentes (VMP/pacote WSL) com progresso
  // via evento 'setup:install-progress'; e revelar um arquivo no Explorer
  // (ação "Mostrar dump" do toast de crash).
  'system:install-wslc': { input: z.void(), output: commandResultSchema },
  'system:show-item': { input: z.object({ path: z.string().min(1) }), output: z.void() },
  // Cobertura completa: sessões wslc ativas, configurações globais do wslc e
  // tuning da sessão nativa (aplicado ao reiniciar a sessão).
  'system:sessions': { input: z.void(), output: z.array(wslcSessionSchema) },
  'system:open-wslc-settings': { input: z.void(), output: z.void() },
  'system:reset-wslc-settings': { input: z.void(), output: commandResultSchema },
  'system:get-native-tuning': { input: z.void(), output: nativeTuningSchema },
  'system:set-native-tuning': { input: nativeTuningSchema, output: z.void() },
  // Termina e recria a sessão nativa (mantém imagens; containers são perdidos).
  'system:restart-native': { input: z.void(), output: commandResultSchema },

  // Escolha da wslcsdk.dll (a versão dela decide se o motor nativo funciona).
  'system:sdk-path': { input: z.void(), output: z.string().nullable() },
  'system:pick-sdk': { input: z.void(), output: sdkProbeSchema.nullable() },
  'system:set-sdk-path': { input: z.object({ path: z.string().nullable() }), output: z.void() },

  // Auto-updater. `check` devolve o estado JÁ com o resultado da checagem; o
  // resto do ciclo (download, erro) chega por evento, porque leva minutos.
  'updates:status': { input: z.void(), output: updateStatusSchema },
  'updates:check': { input: z.void(), output: updateStatusSchema },
  // Fecha o app e aplica a atualização já baixada. Só existe no modo instalador.
  'updates:install': { input: z.void(), output: z.void() },

  'streams:stop': { input: z.object({ streamId: streamIdSchema }), output: z.void() },

  // Terminal embutido: shell interativo dentro do container (os dois motores).
  'terminal:open': { input: z.object({ id: z.string().min(1) }), output: streamIdSchema },
  'terminal:write': {
    input: z.object({ terminalId: streamIdSchema, line: z.string() }),
    output: z.void()
  },
  'terminal:close': { input: z.object({ terminalId: streamIdSchema }), output: z.void() },

  'logs:list': { input: z.void(), output: z.array(logEntrySchema) },
  'logs:clear': { input: z.void(), output: z.void() },
  'logs:open-folder': { input: z.void(), output: z.void() },

  'window:minimize': { input: z.void(), output: z.void() },
  'window:toggle-maximize': { input: z.void(), output: z.boolean() },
  'window:is-maximized': { input: z.void(), output: z.boolean() },
  'window:close': { input: z.void(), output: z.void() }
} as const satisfies Record<string, { input: z.ZodType; output: z.ZodType }>

/** Eventos main → renderer (push), também validados por schema. */
export const eventContract = {
  'streams:data': streamDataEventSchema,
  'streams:exit': streamExitEventSchema,
  'streams:progress': streamProgressEventSchema,
  'terminal:data': terminalDataEventSchema,
  'terminal:exit': terminalExitEventSchema,
  'logs:entry': logEntrySchema,
  'window:state': windowStateEventSchema,
  'native:session-ended': nativeSessionEndedEventSchema,
  'native:crash-dump': nativeCrashDumpEventSchema,
  'setup:install-progress': installProgressEventSchema,
  'updates:status': updateStatusSchema
} as const satisfies Record<string, z.ZodType>

export type InvokeContract = typeof invokeContract
export type InvokeChannel = keyof InvokeContract
/** Payload como o renderer envia (antes do parse). */
export type InvokeRawInput<C extends InvokeChannel> = z.input<InvokeContract[C]['input']>
/** Payload como o handler recebe (depois do parse). */
export type InvokeInput<C extends InvokeChannel> = z.output<InvokeContract[C]['input']>
export type InvokeOutput<C extends InvokeChannel> = z.output<InvokeContract[C]['output']>

export type EventContract = typeof eventContract
export type EventChannel = keyof EventContract
export type EventPayload<C extends EventChannel> = z.output<EventContract[C]>

export const invokeChannels = Object.keys(invokeContract) as InvokeChannel[]
export const eventChannels = Object.keys(eventContract) as EventChannel[]
