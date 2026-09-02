import { Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import type { UpdateState } from '@shared/schemas'
import { Button, Group, Hint, Mono, ProgressBar, StateChip } from '@/design'
import { useUpdateStore } from '@/stores/update-store'
import { Fact } from './Fact'

/**
 * Atualizações do próprio app.
 *
 * A tela é a mesma nos três modos, e a diferença aparece nos botões: com
 * instalador dá para aplicar daqui; no portátil o caminho é a release; rodando
 * do código-fonte não há o que atualizar. O estado vem inteiro do processo
 * main (update-store), inclusive o progresso do download.
 */

const CHIP: Record<UpdateState, { label: string; tone: 'default' | 'success' | 'accent' | 'danger' }> = {
  idle: { label: 'não verificado', tone: 'default' },
  checking: { label: 'verificando…', tone: 'default' },
  'up-to-date': { label: 'em dia', tone: 'success' },
  available: { label: 'versão nova', tone: 'accent' },
  downloading: { label: 'baixando', tone: 'accent' },
  downloaded: { label: 'pronta para instalar', tone: 'success' },
  error: { label: 'falhou', tone: 'danger' }
}

const formatMoment = (ms: number): string =>
  new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function UpdateCard(): React.JSX.Element {
  const status = useUpdateStore((s) => s.status)
  const checking = useUpdateStore((s) => s.checking)
  const check = useUpdateStore((s) => s.check)
  const install = useUpdateStore((s) => s.install)

  const chip = status ? CHIP[status.state] : { label: 'consultando…', tone: 'default' as const }
  const disabled = status?.mode === 'disabled'
  const busy = checking || status?.state === 'checking'

  return (
    <Group
      actions={<StateChip label={chip.label} tone={chip.tone} />}
      className="xl:col-span-2"
      title="Atualizações"
    >
      <dl className="grid gap-x-6 sm:grid-cols-2">
        <Fact label="Versão instalada">
          <Mono>{status?.currentVersion ?? '-'}</Mono>
        </Fact>
        <Fact label="Última checagem">
          {status?.checkedAt ? formatMoment(status.checkedAt) : 'ainda não'}
        </Fact>
        <Fact label="Versão nova">
          <Mono>{status?.newVersion ?? '-'}</Mono>
        </Fact>
        <Fact label="Canal">
          estáveis
          <Hint text="Pré-lançamentos (0.3.0-rc.1) não contam como atualização. Eles continuam publicados no GitHub, para baixar à mão." />
        </Fact>
      </dl>

      {status?.state === 'downloading' && (
        <ProgressBar
          aria-label="Progresso do download da atualização"
          className="mt-4"
          color="accent"
          size="sm"
          value={status.percent ?? 0}
        >
          <ProgressBar.Track className="h-1.5">
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}

      <p className="mt-4 max-w-[80ch] text-sm leading-relaxed text-muted">
        {disabled && status?.reason}
        {status?.mode === 'portable' &&
          'A versão portátil não se instala sozinha: o app avisa quando sai uma versão nova e leva para a release, onde você baixa o .exe novo por cima do antigo.'}
        {status?.mode === 'installer' &&
          'O app procura atualização ao abrir e a cada 6 horas, baixa em segundo plano e aplica quando você fecha o app — nada é interrompido no meio do caminho.'}
      </p>

      {status?.error && (
        <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-danger">
          {status.state === 'downloaded'
            ? `A atualização já baixada continua valendo. Último erro: ${status.error}`
            : status.error}
        </p>
      )}

      {status?.releaseNotes && status.state !== 'up-to-date' && (
        <pre className="inset-well mt-4 max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-muted scrollbar">
          {status.releaseNotes}
        </pre>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button isDisabled={disabled || busy} size="sm" variant="secondary" onPress={() => void check()}>
          <RefreshCw className="size-4" />
          {busy ? 'Procurando…' : 'Procurar atualizações'}
        </Button>
        {status?.state === 'downloaded' && (
          <Button size="sm" onPress={() => void install()}>
            <RotateCw className="size-4" />
            Reiniciar e instalar agora
          </Button>
        )}
        {status?.releaseUrl && status.mode === 'portable' && (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void window.wslcApi.openExternal(status.releaseUrl as string)}
          >
            <Download className="size-4" />
            Baixar na release
          </Button>
        )}
        <Button
          className="ms-auto"
          size="sm"
          variant="ghost"
          onPress={() =>
            void window.wslcApi.openExternal('https://github.com/blackfoxsoftware/wslc-ui/releases')
          }
        >
          <ExternalLink className="size-4" />
          Todas as releases
        </Button>
      </div>
    </Group>
  )
}
