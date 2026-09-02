import { useCallback, useEffect, useState } from 'react'
import { FileCog, ListTree, RefreshCw, Undo2 } from 'lucide-react'
import type { WslcSessionInfo } from '@shared/schemas'
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
  Notice,
  Row,
  StateChip,
  toast
} from '@/design'
import { confirmDialog } from '@/stores/confirm-store'
import { useEnvStore } from '@/stores/env-store'
import { Fact, FactWait } from './Fact'

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

/** O que está instalado na máquina e quais sessões do wslc estão abertas. */
export default function EnvironmentTab(): React.JSX.Element {
  const env = useEnvStore((s) => s.env)
  const [sessions, setSessions] = useState<WslcSessionInfo[]>([])

  const refreshSessions = useCallback((): void => {
    window.wslcApi
      .listWslcSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [])

  useEffect(refreshSessions, [refreshSessions])

  return (
    <>
      <Group
        actions={
          env ? (
            <StateChip
              label={env.ready ? 'pronto' : 'indisponível'}
              tone={env.ready ? 'success' : 'danger'}
            />
          ) : (
            <StateChip label="verificando…" />
          )
        }
        description="Versões que o app encontrou nesta máquina. Tudo aqui vem do wslc.exe, não do SDK."
        title="Instalação"
      >
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <Fact divider={false} label="WSL">
            {env ? <Mono>{env.wslVersion ?? 'não detectado'}</Mono> : <FactWait />}
          </Fact>
          <Fact divider={false} label="wslc">
            {env ? <Mono>{env.wslcVersion ?? 'não detectado'}</Mono> : <FactWait />}
          </Fact>
        </dl>

        <Notice className="mt-4" status="warning" title="Recurso em preview público">
          O WSL container exige a pré-release 2.9.3 ou mais nova e a GA está prevista para o outono de 2026
          (hemisfério norte). Até lá, comandos e formatos de saída mudam entre versões — não é base para
          produção.
        </Notice>

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
            description="Nenhuma sessão do wslc está aberta neste momento. A CLI cria a dela na primeira operação."
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
            {/* text-start vence o `text-end` da última coluna: no design system
                a última é sempre a de ações, aqui é um nome. */}
            <Column className="text-start">Nome</Column>
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
    </>
  )
}
