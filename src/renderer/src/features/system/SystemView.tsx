import { useEffect } from 'react'
import { Cpu, Download, MonitorCog, Plug, Power, RefreshCw } from 'lucide-react'
import { IconAction, PageBody, PageHeader, PageShell, StateChip, Tabs, toast } from '@/design'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import { useEnvStore } from '@/stores/env-store'
import { useNativeStore } from '@/stores/native-store'
import EngineTab from './EngineTab'
import EnvironmentTab from './EnvironmentTab'
import NativeApiTab from './NativeApiTab'
import UpdatesTab from './UpdatesTab'

/**
 * Sistema, em abas.
 *
 * Era uma página só com blocos heterogêneos — instalação, sessões,
 * atualizações, escolha de motor, DLL e tuning — numa grade de duas colunas
 * onde metade dos blocos ocupava as duas. O resultado era uma escada com
 * buracos, e o controle mais importante do app (qual motor executa TUDO)
 * ficava abaixo da dobra, como uma linha de `<dl>` no quarto bloco.
 *
 * Cada aba responde a uma pergunta:
 *   Ambiente     o que está instalado, e está funcionando?
 *   Motor        quem executa, e o que eu perco trocando?
 *   API nativa   qual DLL, e com que limites de VM?
 *   Atualizações a versão do app está em dia?
 *
 * O painel só monta quando a aba é selecionada (é assim que o React Aria trata
 * `TabPanel`), então cada aba busca o que precisa ao entrar — voltar para uma
 * aba a atualiza, o que é o que se espera de uma tela de diagnóstico.
 */

const TABS = [
  { id: 'ambiente', label: 'Ambiente', icon: MonitorCog },
  { id: 'motor', label: 'Motor', icon: Cpu },
  { id: 'api-nativa', label: 'API nativa', icon: Plug },
  { id: 'atualizacoes', label: 'Atualizações', icon: Download }
] as const

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

export default function SystemView(): React.JSX.Element {
  const recheck = useEnvStore((s) => s.refresh)
  const refreshNative = useNativeStore((s) => s.refresh)
  const loadEngine = useEngineStore((s) => s.load)
  const engine = useEngineStore((s) => s.status?.engine)

  // Motor e SDK são carregados pela view, não pela aba: o chip do cabeçalho
  // mostra o motor ativo em qualquer aba, e a aba Motor precisa saber se a DLL
  // respondeu antes de deixar escolher o nativo.
  useEffect(() => {
    void refreshNative()
    void loadEngine()
  }, [refreshNative, loadEngine])

  const PANELS = {
    ambiente: <EnvironmentTab />,
    motor: <EngineTab />,
    'api-nativa': <NativeApiTab />,
    atualizacoes: <UpdatesTab />
  }

  return (
    // `fill`: quem rola é o painel da aba, por baixo da faixa de abas. Sem
    // isso a faixa sobe junto com o conteúdo e a navegação sai da tela.
    <PageShell fill>
      <PageHeader
        flush
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
        meta={
          engine === undefined ? undefined : (
            <StateChip
              label={engine === 'native' ? 'motor nativo' : 'motor CLI'}
              tone={engine === 'native' ? 'accent' : 'default'}
            />
          )
        }
        title="Sistema"
      />

      <Tabs className="min-h-0 flex-1 gap-0" defaultSelectedKey="ambiente" variant="secondary">
        {/*
         * O container precisa ser filho DIRETO do <Tabs>: a variante secondary
         * é escrita em `.tabs--secondary > .tabs__list-container`, e foi por
         * isso que a faixa não podia ficar dentro do <PageHeader>.
         *
         * page-bar dá a ela o mesmo material do cabeçalho (fundo da janela +
         * grão), então título e abas leem como um bloco só. px-3 aqui + px-3 da
         * aba = os 24px de sarjeta do conteúdo.
         */}
        <Tabs.ListContainer className="page-bar px-3">
          <Tabs.List aria-label="Seções de Sistema">
            {TABS.map(({ id, label, icon: Icon }) => (
              <Tabs.Tab key={id} id={id}>
                <Icon aria-hidden className="size-4" />
                {label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        {TABS.map(({ id }) => (
          <Tabs.Panel key={id} className="min-h-0 flex-1 overflow-y-auto scrollbar" id={id}>
            <PageBody>{PANELS[id]}</PageBody>
          </Tabs.Panel>
        ))}
      </Tabs>
    </PageShell>
  )
}
