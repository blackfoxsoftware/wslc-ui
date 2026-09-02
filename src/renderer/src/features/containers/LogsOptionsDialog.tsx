import { useState } from 'react'
import type { ContainerInfo, ContainerLogsOptions } from '@shared/schemas'
import { AppModal, Button, NumberInput, SwitchInput, TextInput } from '@/design'
import { useStreamStore } from '@/stores/stream-store'
import { logStreamTitle, TAIL_PADRAO } from './logs'

interface Props {
  container: ContainerInfo
  onClose: () => void
}

/**
 * As opções do `wslc container logs` (2.9.9 consolidou timestamps e recorte
 * por data). O botão de logs da lista continua sendo um clique só, com a
 * cauda padrão; quem precisa de mais vem aqui.
 *
 * Recurso do motor CLI: no nativo o log chega por callback, desde o começo,
 * e não há como pedir cauda nem recorte.
 */
export default function LogsOptionsDialog({ container, onClose }: Props): React.JSX.Element {
  const openStream = useStreamStore((s) => s.open)
  const label = container.name || container.id.slice(0, 12)
  const [follow, setFollow] = useState(true)
  const [tail, setTail] = useState<number | undefined>(TAIL_PADRAO)
  const [tudo, setTudo] = useState(false)
  const [timestamps, setTimestamps] = useState(false)
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')

  const tailOk = tudo || tail !== undefined

  const submit = async (): Promise<void> => {
    if (!tailOk) return
    const opts: ContainerLogsOptions = {
      follow,
      tail: tudo ? undefined : tail,
      timestamps: timestamps || undefined,
      since: since.trim() || undefined,
      until: until.trim() || undefined
    }
    await openStream(logStreamTitle(label, opts), () =>
      window.wslcApi.streamLogs(container.id || container.name, opts)
    )
    onClose()
  }

  return (
    <AppModal
      description="Escolhe o recorte antes de abrir o painel de saída."
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={!tailOk} onPress={() => void submit()}>
            Ver logs
          </Button>
        </>
      }
      size="md"
      title={`Logs de ${label}`}
      onClose={onClose}
    >
      <NumberInput
        autoFocus
        hint="Quantas linhas do fim do log mostrar antes de acompanhar (-n)."
        isDisabled={tudo}
        label="Últimas linhas"
        value={tudo ? undefined : tail}
        onChange={setTail}
      />
      <div className="field-group flex flex-col gap-3 px-4 py-3">
        <SwitchInput
          hint="Sem cauda a CLI despeja o log inteiro desde o primeiro byte — pode ser muito."
          isSelected={tudo}
          label="Mostrar o log inteiro"
          onChange={setTudo}
        />
        <SwitchInput
          hint="Continua acompanhando as linhas novas em vez de encerrar (-f)."
          isSelected={follow}
          label="Acompanhar ao vivo"
          onChange={setFollow}
        />
        <SwitchInput
          hint="Prefixa cada linha com data e hora (-t)."
          isSelected={timestamps}
          label="Mostrar carimbo de hora"
          onChange={setTimestamps}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          hint="Segundos unix ou RFC3339, ex.: 2026-09-01T10:30:00Z."
          label="A partir de"
          placeholder="opcional"
          value={since}
          onChange={setSince}
        />
        <TextInput
          hint="Segundos unix ou RFC3339. Combina com “A partir de” para um intervalo."
          label="Até"
          placeholder="opcional"
          value={until}
          onChange={setUntil}
        />
      </div>
    </AppModal>
  )
}
