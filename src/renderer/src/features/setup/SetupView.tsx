import { useEffect, useState } from 'react'
import { CheckCircle2, Download, XCircle } from 'lucide-react'
import type { InstallProgressEvent, WslcEnvironment } from '@shared/schemas'
import { BrandWordmark } from '@/components/brand'
import { Button, ProgressBar, toast } from '@/design'

interface Props {
  env: WslcEnvironment
  checking: boolean
  onRetry: () => void
}

function ChecklistItem({ ok, children }: { ok: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex items-center gap-2.5 text-sm" data-state={ok ? 'ok' : 'fail'}>
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="size-4 shrink-0 text-danger" />
      )}
      <span>{children}</span>
    </li>
  )
}

export default function SetupView({ env, checking, onRetry }: Props): React.JSX.Element {
  // Instalação guiada (Fase 6): WslcInstallWithDependencies via a DLL
  // vendorada, disponível mesmo sem o WSL/wslc instalados.
  const [installAvailable, setInstallAvailable] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<InstallProgressEvent | null>(null)

  useEffect(() => {
    let mounted = true
    window.wslcApi
      .getNativeStatus()
      .then((status) => {
        if (mounted) setInstallAvailable(status.available)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => window.wslcApi.onInstallProgress(setProgress), [])

  const install = async (): Promise<void> => {
    setInstalling(true)
    setProgress(null)
    try {
      const res = await window.wslcApi.installWslc()
      if (res.ok) {
        toast.success(res.stdout || 'Instalação concluída.')
        onRetry()
      } else {
        toast.danger(res.stderr || 'A instalação falhou.')
      }
    } finally {
      setInstalling(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-md border border-border bg-surface p-8">
        <header className="flex flex-col gap-4">
          <BrandWordmark className="h-5" />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Ambiente ainda não está pronto
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              O WSL container (<code className="font-mono">wslc.exe</code>) está em preview e exige{' '}
              <strong className="text-foreground">WSL 2.9.3 ou superior</strong> (pré-release).
            </p>
          </div>
        </header>

        <ul className="flex flex-col gap-2.5">
          <ChecklistItem ok={env.wslInstalled}>
            WSL instalado {env.wslVersion ? `(versão ${env.wslVersion})` : ''}
          </ChecklistItem>
          <ChecklistItem ok={env.wslVersionOk}>
            WSL 2.9.3+ pré-release {env.wslVersion ? `(atual: ${env.wslVersion})` : ''}
          </ChecklistItem>
          <ChecklistItem ok={env.wslcAvailable}>
            wslc.exe disponível {env.wslcVersion ? `(${env.wslcVersion})` : ''}
          </ChecklistItem>
        </ul>

        {installAvailable && (
          <div className="inset-well flex flex-col gap-3 p-4">
            <p className="text-sm leading-relaxed">
              <strong>Instalação guiada:</strong> o SDK nativo instala o que estiver faltando (Virtual Machine
              Platform e o pacote WSL) com progresso por componente.
            </p>
            {installing && (
              <ProgressBar
                aria-label="Progresso da instalação"
                value={progress && progress.total > 0 ? (progress.step / progress.total) * 100 : undefined}
              >
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
                <span className="text-xs text-muted">
                  {progress
                    ? `${progress.component}, etapa ${progress.step} de ${progress.total}`
                    : 'Preparando instalação…'}
                </span>
              </ProgressBar>
            )}
            <div>
              <Button isDisabled={installing} onPress={() => void install()}>
                <Download className="size-4" />
                {installing ? 'Instalando…' : 'Instalar componentes automaticamente'}
              </Button>
            </div>
            <p className="text-xs text-muted">
              A Virtual Machine Platform pode exigir reinicializar o Windows para concluir.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {installAvailable
              ? 'Alternativa manual: abra o PowerShell e execute:'
              : 'Para instalar, abra o PowerShell e execute:'}
          </p>
          <pre className="inset-well select-all px-4 py-3 font-mono text-sm">wsl --update --pre-release</pre>
          <p className="text-sm leading-relaxed text-muted">
            Depois confirme com <code className="font-mono">wsl --version</code> e{' '}
            <code className="font-mono">wslc version</code>. Alternativa: baixar o release direto do{' '}
            <a
              className="text-accent hover:underline"
              href="https://github.com/microsoft/WSL/releases"
              rel="noreferrer"
              target="_blank"
            >
              GitHub do WSL
            </a>
            .
          </p>
        </div>

        <div>
          <Button
            isDisabled={checking}
            variant={installAvailable ? 'secondary' : 'primary'}
            onPress={onRetry}
          >
            {checking ? 'Verificando…' : 'Verificar novamente'}
          </Button>
        </div>
      </div>
    </div>
  )
}
