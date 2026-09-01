import { useCallback, useEffect, useState } from 'react'
import { FileCog, ListTree, Power, RefreshCw, RotateCcw, Save, Undo2 } from 'lucide-react'
import type { NativeTuning, WslcSessionInfo } from '@shared/schemas'
import {
  Button,
  Cell,
  Column,
  DataTable,
  Empty,
  Group,
  Hint,
  IconAction,
  Mono,
  PageBody,
  PageHeader,
  PageShell,
  Row,
  SectionTitle,
  StateChip,
  SwitchInput,
  TextInput,
  ToggleButton,
  toast
} from '@/design'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import { useEnvStore } from '@/stores/env-store'
import { useNativeStore } from '@/stores/native-store'

const LINKS = [
  {
    href: 'https://learn.microsoft.com/windows/wsl/wsl-container',
    label: 'Documentação do WSL container · Microsoft Learn'
  },
  {
    href: 'https://learn.microsoft.com/windows/wsl/tutorials/wsl-containers',
    label: 'Tutorial: primeiros passos com wslc'
  },
  {
    href: 'https://wsl.dev/api-reference/',
    label: 'Referência da API · C, C# e C++'
  },
  { href: 'https://aka.ms/wslc-samples', label: 'Exemplos oficiais da API WSLC' },
  { href: 'https://github.com/microsoft/WSL/releases', label: 'Releases do WSL · pré-release 2.9.3+' }
]

const resetNative = async (reloadEngine: () => Promise<void>): Promise<void> => {
  const ok = await confirmDialog({
    title: 'Resetar a sessão nativa?',
    description:
      'Termina a sessão "WslcUi" e apaga o storage dela: TODOS os containers, registros órfãos e imagens da sessão nativa serão perdidos. A sessão é recriada vazia na próxima operação.',
    confirmLabel: 'Resetar sessão nativa',
    destructive: true
  })
  if (!ok) return
  const res = await window.wslcApi.resetNativeSession()
  if (res.ok) toast.success(res.stdout || 'Sessão nativa resetada.')
  else toast.danger(res.stderr || 'Falha ao resetar a sessão nativa.')
  await reloadEngine()
}

const terminate = async (): Promise<void> => {
  const ok = await confirmDialog({
    title: 'Encerrar a sessão do WSL container?',
    description: 'Containers em execução serão parados e a RAM será liberada.',
    confirmLabel: 'Encerrar sessão',
    destructive: true
  })
  if (!ok) return
  const res = await window.wslcApi.terminateSession()
  if (res.ok) toast.success('Sessão encerrada.')
  else toast.danger(res.stderr || res.stdout || 'Falha ao encerrar a sessão')
}

const resetWslcSettings = async (): Promise<void> => {
  const ok = await confirmDialog({
    title: 'Redefinir as configurações do wslc?',
    description: 'O settings.yaml global do wslc volta aos padrões internos (wslc settings reset).',
    confirmLabel: 'Redefinir',
    destructive: true
  })
  if (!ok) return
  const res = await window.wslcApi.resetWslcSettings()
  if (res.ok) toast.success(res.stdout.trim() || 'Configurações do wslc redefinidas.')
  else toast.danger(res.stderr || res.stdout || 'Falha ao redefinir as configurações.')
}

const parseField = (raw: string): number | undefined => {
  const n = Number.parseInt(raw, 10)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** Linha de dado do bloco de ambiente: rótulo à esquerda, valor à direita. */
function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-4 border-b border-separator py-2 last:border-b-0">
      <dt className="w-36 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  )
}

export default function SystemView(): React.JSX.Element {
  const env = useEnvStore((s) => s.env)
  const recheck = useEnvStore((s) => s.refresh)
  const native = useNativeStore((s) => s.status)
  const refreshNative = useNativeStore((s) => s.refresh)
  const engineStatus = useEngineStore((s) => s.status)
  const switching = useEngineStore((s) => s.switching)
  const loadEngine = useEngineStore((s) => s.load)
  const setEngine = useEngineStore((s) => s.setEngine)
  const [sessions, setSessions] = useState<WslcSessionInfo[]>([])
  const [cpuCount, setCpuCount] = useState('')
  const [memoryMb, setMemoryMb] = useState('')
  const [vhdSizeMb, setVhdSizeMb] = useState('')
  const [gpu, setGpu] = useState(false)
  const [savingTuning, setSavingTuning] = useState(false)

  const refreshSessions = useCallback((): void => {
    window.wslcApi
      .listWslcSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    void refreshNative()
    void loadEngine()
    refreshSessions()
    window.wslcApi
      .getNativeTuning()
      .then((t: NativeTuning) => {
        setCpuCount(t.cpuCount ? String(t.cpuCount) : '')
        setMemoryMb(t.memoryMb ? String(t.memoryMb) : '')
        setVhdSizeMb(t.vhdSizeMb ? String(t.vhdSizeMb) : '')
        setGpu(t.gpu ?? false)
      })
      .catch(() => undefined)
  }, [refreshNative, loadEngine, refreshSessions])

  const saveTuning = async (): Promise<void> => {
    const tuning: NativeTuning = {
      cpuCount: parseField(cpuCount),
      memoryMb: parseField(memoryMb),
      vhdSizeMb: parseField(vhdSizeMb),
      gpu: gpu || undefined
    }
    const restart =
      engineStatus?.engine === 'native' &&
      (await confirmDialog({
        title: 'Salvar e reiniciar a sessão nativa?',
        description:
          'O tuning só vale quando a sessão é recriada. Reiniciar agora remove os containers nativos em execução (as imagens são mantidas).',
        confirmLabel: 'Salvar e reiniciar',
        destructive: true
      }))
    if (engineStatus?.engine === 'native' && !restart) return
    setSavingTuning(true)
    try {
      await window.wslcApi.setNativeTuning(tuning)
      if (restart) {
        const res = await window.wslcApi.restartNativeSession()
        if (res.ok) toast.success(res.stdout || 'Sessão nativa reiniciada com o novo tuning.')
        else toast.danger(res.stderr || 'Falha ao reiniciar a sessão nativa.')
        await loadEngine()
      } else {
        toast.success('Tuning salvo: vale quando a sessão nativa for criada.')
      }
    } finally {
      setSavingTuning(false)
    }
  }

  const engine = engineStatus?.engine ?? 'cli'

  return (
    <PageShell>
      <PageHeader
        actions={
          <>
            <IconAction label="Reverificar ambiente" variant="secondary" onPress={() => void recheck()}>
              <RefreshCw className="size-4" />
            </IconAction>
            <IconAction
              label="Encerrar a sessão do WSL container e liberar a RAM"
              variant="danger-soft"
              onPress={() => void terminate()}
            >
              <Power className="size-4" />
            </IconAction>
          </>
        }
        title="Sistema"
      />

      <PageBody className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <Group title="Ambiente">
          <dl className="flex flex-col">
            <Fact label="WSL">{env?.wslVersion ?? 'não detectado'}</Fact>
            <Fact label="wslc">{env?.wslcVersion ?? 'não detectado'}</Fact>
            <Fact label="Status">
              <StateChip
                label={env?.ready ? 'pronto' : 'indisponível'}
                tone={env?.ready ? 'success' : 'danger'}
              />
            </Fact>
          </dl>
          <p className="mt-4 max-w-[80ch] text-sm leading-relaxed text-muted">
            O WSL container está em <strong className="text-foreground">preview público</strong> (WSL 2.9.3+
            pré-release). GA prevista para o outono de 2026 (hemisfério norte). Não recomendado para produção.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onPress={() => void window.wslcApi.openWslcSettings()}>
              <FileCog className="size-4" />
              Abrir settings.yaml do wslc
            </Button>
            <Button size="sm" variant="secondary" onPress={() => void resetWslcSettings()}>
              <Undo2 className="size-4" />
              Redefinir configurações do wslc
            </Button>
          </div>
        </Group>

        <DataTable
          ariaLabel="Sessões wslc"
          emptyState={
            <Empty
              description="Nenhuma sessão do wslc está aberta neste momento."
              icon={<ListTree />}
              title="Sem sessões ativas"
            />
          }
          head={
            <>
              <Column isRowHeader width={90}>
                ID
              </Column>
              <Column width={140}>PID do criador</Column>
              <Column>Nome</Column>
            </>
          }
          toolbar={
            <>
              <h2 className="font-display text-sm font-semibold tracking-tight">Sessões wslc ativas</h2>
              <Hint text='A CLI cria a "wslc-cli-…" sob demanda; "WslcUi" é a sessão do motor nativo. Os subcomandos session enter/run/shell são para uso em terminal: anexam a sessões existentes pela pasta de storage.' />
              <IconAction
                className="ms-auto"
                label="Atualizar sessões"
                variant="secondary"
                onPress={refreshSessions}
              >
                <RefreshCw className="size-4" />
              </IconAction>
            </>
          }
        >
          {sessions.map((s) => (
            <Row key={s.id} id={String(s.id)}>
              <Cell>
                <Mono>{s.id}</Mono>
              </Cell>
              <Cell>
                <Mono>{s.creatorPid}</Mono>
              </Cell>
              <Cell>
                <Mono>{s.displayName}</Mono>
              </Cell>
            </Row>
          ))}
        </DataTable>

        <Group
          actions={
            native ? (
              <StateChip
                label={native.available ? 'disponível' : 'indisponível'}
                tone={native.available ? 'success' : 'default'}
              />
            ) : (
              <StateChip label="verificando…" />
            )
          }
          className="xl:col-span-2"
          title="API nativa (wslcsdk)"
        >
          <dl className="flex flex-col">
            <Fact label="Motor">
              <div className="flex gap-1.5">
                <ToggleButton
                  isDisabled={switching || !engineStatus}
                  isSelected={engine === 'cli'}
                  size="sm"
                  onChange={() => void setEngine('cli')}
                >
                  CLI
                </ToggleButton>
                <ToggleButton
                  isDisabled={switching || !engineStatus || !native?.available}
                  isSelected={engine === 'native'}
                  size="sm"
                  onChange={() => void setEngine('native')}
                >
                  Nativo
                </ToggleButton>
                <Hint text="CLI chama o wslc.exe a cada operação; Nativo usa a wslcsdk.dll por FFI, numa sessão própria do app." />
              </div>
            </Fact>
            <Fact label="Sessão nativa">
              {engineStatus?.engine === 'native'
                ? engineStatus.sessionActive
                  ? '"WslcUi" ativa'
                  : 'criada na primeira operação'
                : 'inativa'}
            </Fact>
            <Fact label="SDK">
              <Mono>{native?.sdkVersion ?? '-'}</Mono>
            </Fact>
            <Fact label="DLL">
              <Mono className="block truncate text-muted">{native?.dllPath ?? '-'}</Mono>
            </Fact>
            {native && native.missingComponents.length > 0 && (
              <Fact label="Faltando">{native.missingComponents.join(', ')}</Fact>
            )}
          </dl>

          <p className="mt-4 max-w-[80ch] text-sm leading-relaxed text-muted">
            {native?.detail ?? 'Consultando a wslcsdk.dll…'} {engineStatus?.detail}
          </p>
          <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-muted">
            No motor nativo, containers (executar, ações, logs, exec, inspect, terminal), imagens (listar,
            pull e push com progresso por camada, login em registry, tag, load/import de tarball, remover) e
            volumes VHDX (tamanho, tipo e dono) usam a sessão própria do app (&quot;WslcUi&quot;) via FFI.
            Crashes de processos nos containers geram um aviso com o caminho do dump (.dmp) coletado pelo WSL.
            Como o SDK preview não permite reabrir handles, os containers nativos são removidos quando o app
            fecha. Build, save, export, stats e redes nomeadas só existem no motor CLI.
          </p>

          <section className="mt-5 flex flex-col gap-4 border-t border-separator pt-5">
            <SectionTitle description="Limites da VM da sessão “WslcUi”. Campo vazio usa o padrão do WSL.">
              Tuning da sessão nativa
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TextInput
                hint="Núcleos visíveis dentro da sessão."
                label="CPUs"
                placeholder="ex.: 2"
                value={cpuCount}
                onChange={setCpuCount}
              />
              <TextInput
                hint="Limite de RAM da sessão, em MB."
                label="Memória"
                placeholder="ex.: 2048"
                value={memoryMb}
                onChange={setMemoryMb}
              />
              <TextInput
                hint="Tamanho do disco virtual de storage, em MB."
                label="VHD do storage"
                placeholder="ex.: 10240"
                value={vhdSizeMb}
                onChange={setVhdSizeMb}
              />
              <SwitchInput
                className="self-end pb-2"
                hint="Expõe /dev/dxg na sessão, para cargas com GPU."
                isSelected={gpu}
                label="GPU na sessão"
                onChange={setGpu}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                isDisabled={savingTuning || !native?.available}
                size="sm"
                onPress={() => void saveTuning()}
              >
                <Save className="size-4" />
                {savingTuning ? 'Salvando…' : 'Salvar tuning'}
              </Button>
              <Button
                isDisabled={!native?.available}
                size="sm"
                variant="danger-soft"
                onPress={() => void resetNative(loadEngine)}
              >
                <RotateCcw className="size-4" />
                Resetar sessão nativa
              </Button>
            </div>
          </section>
        </Group>

        <Group className="xl:col-span-2" title="Referências">
          <ul className="flex flex-col gap-2 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a className="text-accent hover:underline" href={link.href} rel="noreferrer" target="_blank">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </Group>
      </PageBody>
    </PageShell>
  )
}
