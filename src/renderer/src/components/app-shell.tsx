import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import type { NativeSessionEndedEvent } from '@shared/schemas'
import AppRail from '@/components/app-rail'
import ConfirmDialog from '@/components/confirm-dialog'
import LogsPanel from '@/components/logs-panel'
import StreamPanel from '@/components/stream-panel'
import TitleBar from '@/components/title-bar'
import { Spinner, ToastProvider, toast } from '@/design'
import SetupView from '@/features/setup/SetupView'
import { useLogsStore } from '@/features/logs/store'
import { useEngineStore } from '@/stores/engine-store'
import { useEnvStore } from '@/stores/env-store'
import { initStreamSubscriptions } from '@/stores/stream-store'

const SESSION_END_REASONS: Record<NativeSessionEndedEvent['reason'], string> = {
  shutdown: 'o WSL foi desligado',
  crashed: 'a sessão travou',
  unknown: 'motivo desconhecido'
}

export default function AppShell(): React.JSX.Element {
  const env = useEnvStore((s) => s.env)
  const checking = useEnvStore((s) => s.checking)
  const refreshEnv = useEnvStore((s) => s.refresh)

  useEffect(() => {
    void refreshEnv()
  }, [refreshEnv])

  useEffect(() => initStreamSubscriptions(), [])

  // Entradas de log ao vivo do processo main → store da view Logs.
  useEffect(() => window.wslcApi.onLogEntry((entry) => useLogsStore.getState().append(entry)), [])

  useEffect(
    () =>
      window.wslcApi.onNativeSessionEnded((ev) => {
        toast.warning(
          `Sessão nativa encerrada (${SESSION_END_REASONS[ev.reason]}). Será recriada na próxima operação.`
        )
        void useEngineStore.getState().load()
      }),
    []
  )

  // Fase 6: processo Linux gerou crash dump → toast com a coleta do .dmp.
  useEffect(
    () =>
      window.wslcApi.onNativeCrashDump((ev) => {
        toast.warning(`Processo travou num container: ${ev.processName} (pid ${ev.pid}, ${ev.signalName})`, {
          description: ev.dumpPath,
          timeout: 10_000,
          actionProps: ev.dumpPath
            ? {
                children: 'Mostrar dump',
                onPress: () => void window.wslcApi.showItemInFolder(ev.dumpPath)
              }
            : undefined
        })
      }),
    []
  )

  let layout: React.JSX.Element
  if (checking && env === null) {
    layout = (
      <>
        <TitleBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <div className="text-sm text-muted">Verificando ambiente…</div>
        </div>
      </>
    )
  } else if (env && !env.ready) {
    layout = (
      <>
        <TitleBar />
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
          <SetupView checking={checking} env={env} onRetry={() => void refreshEnv()} />
        </div>
      </>
    )
  } else {
    layout = (
      <>
        <TitleBar withRailToggle />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppRail />
          <main className="flex min-w-0 flex-1 flex-col border-s border-border">
            <Outlet />
            <StreamPanel />
            <LogsPanel />
          </main>
        </div>
      </>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {layout}
      <ConfirmDialog />
      <ToastProvider placement="bottom end" />
    </div>
  )
}
