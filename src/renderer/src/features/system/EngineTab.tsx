import { Check, Minus } from 'lucide-react'
import { Cell, Column, DataTable, Group, Hint, Row, ToggleButton, ToggleButtonGroup } from '@/design'
import { cn } from '@/lib/utils'
import { useEngineStore } from '@/stores/engine-store'
import { useNativeStore } from '@/stores/native-store'
import { CAPABILITIES } from './capabilities'
import { Fact, FactWait } from './Fact'

/**
 * Resumo de um motor, ao lado do botão que o escolhe.
 *
 * O fio de acento na borda inicial marca o que está ativo — mesma ideia do
 * item ativo do rail. Sem card: aqui é hairline e espaço, e a informação que
 * decide a escolha fica ao lado do controle em vez de num parágrafo abaixo.
 */
function EngineSummary({
  name,
  binary,
  active,
  children
}: {
  name: string
  binary: string
  active: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-1.5 border-s-2 ps-4', active ? 'border-accent' : 'border-separator')}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-sm font-semibold tracking-tight">{name}</span>
        <span className="font-mono text-xs text-muted">{binary}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted">{children}</p>
    </div>
  )
}

/**
 * Célula da matriz. O ícone é para o olho varrer a coluna; o texto ao lado
 * dele é o que sai no leitor de tela, porque "✓ numa coluna chamada Nativo"
 * não é lido como resposta a nada.
 */
function Support({ ok, engine }: { ok: boolean; engine: string }): React.JSX.Element {
  const label = ok ? `disponível no motor ${engine}` : `indisponível no motor ${engine}`
  return (
    <span className="flex justify-center">
      <span className="sr-only">{label}</span>
      {ok ? (
        <Check aria-hidden className="size-4 text-success" />
      ) : (
        <Minus aria-hidden className="size-4 text-muted/60" />
      )}
    </span>
  )
}

/** Escolha do motor de execução e o que cada um cobre. */
export default function EngineTab(): React.JSX.Element {
  const native = useNativeStore((s) => s.status)
  const engineStatus = useEngineStore((s) => s.status)
  const switching = useEngineStore((s) => s.switching)
  const setEngine = useEngineStore((s) => s.setEngine)
  const engine = engineStatus?.engine ?? 'cli'

  return (
    <>
      <Group
        description="Vale para o app inteiro, não só para esta tela. A troca é imediata e fica gravada para a próxima abertura."
        title="Motor de execução"
      >
        {/*
         * Grupo, e não dois ToggleButton soltos: para o leitor de tela dois
         * toggles independentes são duas chaves liga/desliga que por acaso
         * estão lado a lado, e nada diz que escolher um desliga o outro.
         * `selectionMode="single"` diz — e traz a navegação por setas junto.
         */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label="Motor de execução"
            isDisabled={switching || !engineStatus}
            selectedKeys={[engine]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const escolhido = [...keys][0]
              if (escolhido && escolhido !== engine) void setEngine(escolhido as 'cli' | 'native')
            }}
          >
            <ToggleButton id="cli">CLI</ToggleButton>
            <ToggleButton id="native" isDisabled={!native?.available}>
              Nativo
            </ToggleButton>
          </ToggleButtonGroup>
          {!native?.available && (
            <Hint text="O motor nativo depende da wslcsdk.dll. Enquanto ela não carregar, só a CLI está disponível — veja a aba API nativa." />
          )}
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <EngineSummary active={engine === 'cli'} binary="wslc.exe" name="CLI">
            Um processo por operação, na sessão que o próprio wslc abre (&quot;wslc-cli-…&quot;). Cobertura
            completa: é a referência do produto e o único caminho para build, redes e cópia de arquivos.
          </EngineSummary>
          <EngineSummary active={engine === 'native'} binary="wslcsdk.dll" name="Nativo">
            Chamadas diretas por FFI numa sessão própria do app (&quot;WslcUi&quot;), sem subir um processo
            por comando. Mais rápido e com progresso estruturado, em troca de alguns recursos.
          </EngineSummary>
        </div>

        <dl className="mt-5 flex flex-col border-t border-separator pt-1">
          <Fact label="Sessão nativa">
            {engineStatus === null ? (
              <FactWait />
            ) : engineStatus.engine === 'native' ? (
              engineStatus.sessionActive ? (
                '"WslcUi" ativa'
              ) : (
                'criada na primeira operação'
              )
            ) : (
              'inativa'
            )}
          </Fact>
          {engineStatus?.detail && <Fact label="Último resultado">{engineStatus.detail}</Fact>}
        </dl>
      </Group>

      <DataTable
        ariaLabel="Cobertura por motor"
        head={
          <>
            <Column isRowHeader>Recurso</Column>
            {/* text-center vence o `text-end` que a última coluna herda do
                design system: lá a última coluna é sempre a de ações. */}
            <Column className="text-center" width={90}>
              CLI
            </Column>
            <Column className="text-center" width={90}>
              Nativo
            </Column>
          </>
        }
        toolbar={
          <>
            <h2 className="font-display text-sm font-semibold tracking-tight">Cobertura por motor</h2>
            <Hint text="O que falta no motor nativo é o que o SDK preview ainda não expõe. A UI esconde ou avisa em cada caso, então nada aqui falha em silêncio." />
          </>
        }
      >
        {CAPABILITIES.map((c) => (
          <Row key={c.feature} id={c.feature}>
            <Cell>
              <div className="flex flex-col gap-0.5 py-0.5">
                <span>{c.feature}</span>
                {c.detail && <span className="text-xs leading-relaxed text-muted">{c.detail}</span>}
              </div>
            </Cell>
            <Cell>
              <Support engine="CLI" ok={c.cli} />
            </Cell>
            <Cell>
              <Support engine="nativo" ok={c.native} />
            </Cell>
          </Row>
        ))}
      </DataTable>
    </>
  )
}
