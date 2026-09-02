import { app, BrowserWindow } from 'electron'
import { clearLogEntries, getLogEntries, logsDirectory, setOnLogEntry } from '../services/logger'
import { readNativeTuning, readSdkPath, settingsFilePath, writeNativeTuning, writeSdkPath } from '../settings'
import { resolveWslcService } from '../services/wslc'
import { currentEngine, getEngineStatus, setEngine } from '../services/wslc/engine'
import { ops } from '../services/wslc/ops'
import { buildBuildArgs } from '../services/wslc/stream-args'
import { stopStream } from '../services/wslc/streams'
import { closeTerminal, writeTerminal } from '../services/wslc/terminals'
import { shutdownWslc } from '../shutdown'
import { rendererStreamSink, rendererTerminalSink, sendEvent } from './events'
import { registerInvokeHandlers } from './router'

const settingsFile = (): string => settingsFilePath(app.getPath('userData'))

export function registerIpc(): void {
  const service = resolveWslcService()
  // Fronteiras do processo (FFI nativa, streams da CLI e efeitos externos):
  // reais em produção, dubladas sob WSLC_UI_MOCK. Ver services/wslc/ops.ts.
  const { native, stream, host, update } = ops()

  // Tuning persistido da sessão nativa → aplicado quando a sessão for criada.
  native.setTuning(readNativeTuning(settingsFile()))

  // DLL escolhida na aba Sistema. Injetada ANTES de qualquer consulta ao motor
  // nativo — é por isso que trocar de DLL só vale ao reabrir o app: quem já
  // carregou a anterior tem handles dela.
  native.setSdkPath(readSdkPath(settingsFile()))

  // Sessão nativa terminou por fora (WSL desligado/crash) → avisa todas as janelas.
  native.setOnSessionEnded((reason) => {
    for (const win of BrowserWindow.getAllWindows()) {
      sendEvent(win.webContents, 'native:session-ended', { reason })
    }
  })

  // Fase 6: processo Linux gerou crash dump → toast com o caminho do .dmp.
  native.setOnCrashDump((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      sendEvent(win.webContents, 'native:crash-dump', ev)
    }
  })

  // Auto-updater: cada transição (checou, achou, baixou, falhou) vira evento.
  // Sem isso a UI teria que ficar perguntando — e um download leva minutos.
  update.setOnChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      sendEvent(win.webContents, 'updates:status', status)
    }
  })
  update.start()

  // Cada entrada de log vira um evento ao vivo para a view Logs.
  setOnLogEntry((entry) => {
    for (const win of BrowserWindow.getAllWindows()) {
      sendEvent(win.webContents, 'logs:entry', entry)
    }
  })

  registerInvokeHandlers({
    'env:get': () => service.getEnvironment(),

    // Fase 2 do motor nativo: ciclo de vida de containers via wslcsdk quando ativo.
    'containers:list': ({ all }) =>
      currentEngine() === 'native' ? native.listContainers(all) : service.listContainers(all),
    'containers:action': ({ action, id, options }) =>
      currentEngine() === 'native'
        ? native.containerAction(action, id, options)
        : service.containerAction(action, id, options),
    'containers:prune': () =>
      currentEngine() === 'native' ? native.pruneContainers() : service.pruneContainers(),
    'containers:run': (opts) =>
      currentEngine() === 'native' ? native.runContainer(opts) : service.runContainer(opts),
    'containers:exec': ({ id, command, options }) =>
      currentEngine() === 'native'
        ? native.exec(id, command, options)
        : service.execInContainer(id, command, options),
    // No motor nativo o log vem por callback desde o começo: cauda, carimbo de
    // hora e recorte por data são da CLI, e a UI só os oferece nela.
    'containers:logs': ({ id, options }, { event }) =>
      currentEngine() === 'native'
        ? native.streamLogs(id, rendererStreamSink(event.sender))
        : stream.logs(id, options, rendererStreamSink(event.sender)),
    // O SDK preview não expõe stats — no motor nativo a coluna fica vazia.
    'containers:stats': () => (currentEngine() === 'native' ? [] : service.getStats()),
    'containers:inspect': ({ id }) =>
      currentEngine() === 'native' ? native.inspectContainer(id) : service.inspectContainer(id),
    'containers:open-terminal': ({ id }) => {
      host.openExternalTerminal(id)
    },
    'containers:kill': ({ id, signal }) =>
      currentEngine() === 'native' ? native.killContainer(id, signal) : service.killContainer(id, signal),
    // O SDK não exporta filesystem — export é sempre pela CLI (a UI esconde no nativo).
    'containers:export': ({ id, path }) =>
      currentEngine() === 'native'
        ? {
            ok: false,
            code: 1,
            stdout: '',
            stderr: 'O SDK nativo não expõe exportação de containers — troque para o motor CLI.'
          }
        : service.exportContainer(id, path),
    // Não há API de cópia no SDK (nenhuma das 62 funções do header 2.9.9) —
    // `container cp` é exclusivo da CLI, e a UI esconde a ação no nativo.
    'containers:copy': (opts) =>
      currentEngine() === 'native'
        ? {
            ok: false,
            code: 1,
            stdout: '',
            stderr: 'O SDK nativo não copia arquivos — troque para o motor CLI.'
          }
        : service.copyFiles(opts),

    // Fases 1 e 4 do motor nativo: imagens via wslcsdk quando ativo (pull com
    // progresso estruturado por camada; tag/load/import nativos).
    'images:list': () => (currentEngine() === 'native' ? native.listImages() : service.listImages()),
    'images:pull': ({ ref }, { event }) =>
      currentEngine() === 'native'
        ? native.pullImage(ref, rendererStreamSink(event.sender))
        : stream.pull(ref, rendererStreamSink(event.sender)),
    // O SDK deleta a imagem sem opções (nem força, nem --no-prune).
    'images:remove': ({ ref, options }) =>
      currentEngine() === 'native' ? native.removeImage(ref) : service.removeImage(ref, options),
    'images:prune': () => service.pruneImages(),
    'images:inspect': ({ ref }) => service.inspectImage(ref),
    'images:tag': ({ source, target }) =>
      currentEngine() === 'native' ? native.tagImage(source, target) : service.tagImage(source, target),
    // O SDK não expõe exportação — save é sempre pela CLI (a UI esconde no motor nativo).
    'images:save': ({ ref, path }) =>
      currentEngine() === 'native'
        ? {
            ok: false,
            code: 1,
            stdout: '',
            stderr: 'O SDK nativo não expõe exportação de imagens — troque para o motor CLI.'
          }
        : service.saveImage(ref, path),
    'images:load': ({ path }, { event }) =>
      currentEngine() === 'native'
        ? native.loadImage(path, rendererStreamSink(event.sender))
        : stream.load(path, rendererStreamSink(event.sender)),
    'images:import': ({ path, ref }, { event }) =>
      currentEngine() === 'native'
        ? native.importImage(path, ref, rendererStreamSink(event.sender))
        : stream.import(path, ref, rendererStreamSink(event.sender)),
    // Fase 5: push com progresso por camada no motor nativo; login guarda as
    // credenciais (memória na sessão nativa; config do wslc na CLI).
    'images:push': ({ ref }, { event }) =>
      currentEngine() === 'native'
        ? native.pushImage(ref, rendererStreamSink(event.sender))
        : stream.push(ref, rendererStreamSink(event.sender)),
    'registry:login': ({ server, username, password }) =>
      currentEngine() === 'native'
        ? native.login(server, username, password)
        : service.login(server, username, password),
    'registry:logout': ({ server }) =>
      currentEngine() === 'native' ? native.logout(server) : service.logout(server),
    'images:search-registry': ({ query }) => host.searchRegistry(query),
    // Build é sempre da CLI: o SDK não constrói imagem (a UI esconde no nativo).
    'images:build': (opts, { event }) => stream.build(buildBuildArgs(opts), rendererStreamSink(event.sender)),

    // Fase 5: volumes VHD nativos (o SDK não enumera — a lista vem do readdir
    // de <storage>\volumes; volumes "guest" auto-criados não aparecem).
    'volumes:list': () => (currentEngine() === 'native' ? native.listVolumes() : service.listVolumes()),
    // Labels são da CLI: o SDK cria o .vhdx e não guarda metadados.
    'volumes:create': ({ name, vhd, labels }) =>
      currentEngine() === 'native'
        ? native.createVolume(name, vhd ?? { sizeMb: 1024, fixed: false })
        : service.createVolume(name, vhd, labels),
    'volumes:remove': ({ name, force }) =>
      currentEngine() === 'native' ? native.deleteVolume(name) : service.removeVolume(name, force),
    'volumes:prune': () =>
      currentEngine() === 'native'
        ? {
            ok: false,
            code: 1,
            stdout: '',
            stderr: 'O SDK nativo não rastreia uso de volumes — remova individualmente.'
          }
        : service.pruneVolumes(),
    'volumes:inspect': ({ name }) =>
      currentEngine() === 'native' ? native.inspectVolume(name) : service.inspectVolume(name),

    // Redes são um recurso da CLI (o SDK nativo só tem NONE/BRIDGED) — sempre
    // roteadas pela CLI; no motor nativo a view avisa que containers nativos
    // não participam delas.
    'networks:list': () => service.listNetworks(),
    'networks:create': (opts) => service.createNetwork(opts),
    'networks:remove': ({ name, force }) => service.removeNetwork(name, force),
    'networks:prune': () => service.pruneNetworks(),
    'networks:inspect': ({ name }) => service.inspectNetwork(name),
    'networks:connect': (opts) => service.connectNetwork(opts),
    'networks:disconnect': ({ network, container }) => service.disconnectNetwork(network, container),

    'system:terminate-session': () => service.terminateSession(),
    'system:sessions': () => service.listSessions(),
    'system:open-wslc-settings': () => {
      host.openWslcSettings()
    },
    'system:reset-wslc-settings': () => service.resetWslcSettings(),
    'system:get-native-tuning': () => readNativeTuning(settingsFile()),
    'system:set-native-tuning': (tuning) => {
      writeNativeTuning(settingsFile(), tuning)
      native.setTuning(tuning)
    },
    'system:restart-native': () => native.restartSession(),
    'system:sdk-path': () => native.getSdkPath(),
    // Escolher a DLL é: diálogo -> sonda -> grava. A sonda é a parte que
    // importa: sem ela a pessoa só descobriria que errou o arquivo na próxima
    // vez que abrisse o app, com o motor nativo indisponível e sem pista.
    'system:pick-sdk': async (_input, { event }) => {
      const picked = await host.pickFile(BrowserWindow.fromWebContents(event.sender), 'wslcsdk.dll', ['dll'])
      return picked === null ? null : native.probeSdk(picked)
    },
    'system:set-sdk-path': ({ path }) => {
      writeSdkPath(settingsFile(), path)
      native.setSdkPath(path)
    },
    'updates:status': () => update.status(),
    'updates:check': () => update.check(),
    // Encerra a sessão nativa ANTES de entregar o app ao instalador: o NSIS
    // fecha o processo se ele demorar, e um processo morto assim deixa a
    // sessão "WslcUi" órfã no WSL.
    'updates:install': async () => {
      await shutdownWslc()
      update.install()
    },

    'system:native-status': () => native.status(),
    'system:get-engine': () => getEngineStatus(),
    'system:set-engine': ({ engine }) => setEngine(engine),
    'system:reset-native': () => native.resetSession(),
    'system:pick-directory': (_input, { event }) =>
      host.pickDirectory(BrowserWindow.fromWebContents(event.sender)),
    'system:pick-file': ({ title, extensions }, { event }) =>
      host.pickFile(BrowserWindow.fromWebContents(event.sender), title, extensions),
    'system:pick-save': ({ title, defaultName, extensions }, { event }) =>
      host.pickSave(BrowserWindow.fromWebContents(event.sender), title, defaultName, extensions),
    'system:open-external': ({ url }) => {
      host.openExternal(url)
    },
    // Fase 6: instalação guiada (VMP/pacote WSL) com progresso na janela que pediu.
    'system:install-wslc': (_input, { event }) =>
      native.install((ev) => sendEvent(event.sender, 'setup:install-progress', ev)),
    'system:show-item': ({ path }) => {
      host.showItemInFolder(path)
    },

    'streams:stop': ({ streamId }) => stopStream(streamId),

    // Terminal embutido (Fase 3): CLI = exec -i com pipes; nativo = bridge FIFO.
    'terminal:open': ({ id }, { event }) =>
      currentEngine() === 'native'
        ? native.openTerminal(id, rendererTerminalSink(event.sender))
        : stream.openTerminal(id, rendererTerminalSink(event.sender)),
    'terminal:write': ({ terminalId, line }) => writeTerminal(terminalId, line),
    'terminal:close': ({ terminalId }) => closeTerminal(terminalId),

    'logs:list': () => getLogEntries(),
    'logs:clear': () => {
      clearLogEntries()
    },
    'logs:open-folder': () => {
      const dir = logsDirectory()
      if (dir) host.openPath(dir)
    },

    'window:minimize': (_input, { event }) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    },
    'window:toggle-maximize': (_input, { event }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    },
    'window:is-maximized': (_input, { event }) =>
      BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false,
    'window:close': (_input, { event }) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    }
  })
}
