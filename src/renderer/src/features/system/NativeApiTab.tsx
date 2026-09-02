import { useEffect, useState } from 'react'
import { FolderSearch, RotateCcw, Save, Undo2 } from 'lucide-react'
import type { NativeStatus, NativeTuning } from '@shared/schemas'
import {
  Button,
  ErrorAlert,
  Group,
  Hint,
  Mono,
  Notice,
  NumberInput,
  StateChip,
  SwitchInput,
  toast
} from '@/design'
import { confirmDialog } from '@/stores/confirm-store'
import { useEngineStore } from '@/stores/engine-store'
import { useNativeStore } from '@/stores/native-store'
import { Fact, FactWait } from './Fact'

/** Rótulo de onde a DLL em uso saiu (nativeStatus.source). */
const SDK_SOURCES: Record<NonNullable<NativeStatus['source']>, string> = {
  bundled: 'empacotada com o app',
  custom: 'escolhida por você',
  system: 'instalação do WSL',
  env: 'WSLC_SDK_DLL (ambiente)'
}

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

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** A wslcsdk.dll em uso e os limites da VM da sessão nativa. */
export default function NativeApiTab(): React.JSX.Element {
  const native = useNativeStore((s) => s.status)
  const engineStatus = useEngineStore((s) => s.status)
  const loadEngine = useEngineStore((s) => s.load)
  const [cpuCount, setCpuCount] = useState<number | undefined>()
  const [memoryMb, setMemoryMb] = useState<number | undefined>()
  const [vhdSizeMb, setVhdSizeMb] = useState<number | undefined>()
  const [gpu, setGpu] = useState(false)
  const [savingTuning, setSavingTuning] = useState(false)
  const [sdkPath, setSdkPath] = useState<string | null>(null)
  const [pickingSdk, setPickingSdk] = useState(false)

  useEffect(() => {
    window.wslcApi
      .sdkPath()
      .then(setSdkPath)
      .catch(() => setSdkPath(null))
    window.wslcApi
      .getNativeTuning()
      .then((t: NativeTuning) => {
        setCpuCount(t.cpuCount)
        setMemoryMb(t.memoryMb)
        setVhdSizeMb(t.vhdSizeMb)
        setGpu(t.gpu ?? false)
      })
      .catch(() => undefined)
  }, [])

  /**
   * Escolher outra wslcsdk.dll. A sonda roda ANTES de gravar: um arquivo que
   * não é a DLL certa é recusado aqui, e não vira um motor nativo quebrado na
   * próxima abertura.
   */
  const pickSdk = async (): Promise<void> => {
    setPickingSdk(true)
    try {
      const probe = await window.wslcApi.pickSdk()
      if (probe === null) return
      if (!probe.ok) {
        toast.danger(probe.detail)
        return
      }
      await window.wslcApi.setSdkPath(probe.path)
      setSdkPath(probe.path)
      toast.success(`DLL ${probe.abi} escolhida. Reabra o app para passar a usá-la.`)
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : String(e))
    } finally {
      setPickingSdk(false)
    }
  }

  const useBundledSdk = async (): Promise<void> => {
    await window.wslcApi.setSdkPath(null)
    setSdkPath(null)
    toast.success('Voltando para a DLL empacotada. Reabra o app para aplicar.')
  }

  const saveTuning = async (): Promise<void> => {
    const tuning: NativeTuning = {
      cpuCount,
      memoryMb,
      vhdSizeMb,
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

  return (
    <>
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
        description="O app vem com a DLL do SDK. Trocar só faz sentido para casar com um WSL diferente do esperado."
        title="wslcsdk.dll em uso"
      >
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <Fact label="Origem">
            {native?.source ? SDK_SOURCES[native.source] : '-'}
            {sdkPath !== null && native?.source !== 'custom' && (
              <Hint text="Você escolheu outra DLL, mas ela só entra em uso quando o app reabrir." />
            )}
          </Fact>
          <Fact label="ABI da DLL">{native ? <Mono>{native.abi ?? '-'}</Mono> : <FactWait />}</Fact>
          <Fact label="WSL (pelo SDK)">
            {native ? <Mono>{native.wslVersion ?? '-'}</Mono> : <FactWait />}
            <Hint text="O SDK reporta a versão do WSL instalado, não a da própria DLL — binários diferentes respondem o mesmo número." />
          </Fact>
          <Fact label="Tamanho">
            {native ? <Mono>{native.sizeBytes ? megabytes(native.sizeBytes) : '-'}</Mono> : <FactWait />}
          </Fact>
          <Fact className="sm:col-span-2" label="Caminho">
            <Mono className="block truncate text-muted">{native?.dllPath ?? '-'}</Mono>
          </Fact>
          {sdkPath !== null && (
            <Fact className="sm:col-span-2" label="Escolhida">
              <Mono className="block truncate text-muted">{sdkPath}</Mono>
            </Fact>
          )}
        </dl>

        <p className="mt-4 max-w-[80ch] text-sm leading-relaxed text-muted">
          {native?.detail ?? 'Consultando a wslcsdk.dll…'}
        </p>

        {native && native.missingComponents.length > 0 && (
          <ErrorAlert className="mt-4" title="Componentes do Windows faltando">
            {native.missingComponents.join(', ')}. Sem eles a DLL carrega mas a sessão nativa não sobe.
          </ErrorAlert>
        )}

        <p className="mt-4 max-w-[80ch] text-sm leading-relaxed text-muted">
          A versão da DLL decide o que o motor nativo consegue fazer, e como o app precisa chamá-la: entre a
          2.9.3 e a 2.9.9 duas funções mudaram de assinatura sem mudar nada visível. O app detecta isso
          sozinho pela ABI e se adapta — mas a troca só vale ao reabrir, porque a sessão nativa viva segura
          handles da DLL atual.
        </p>

        <Notice className="mt-4" status="default" title="A partir da ABI 2.9.9 os containers sobrevivem">
          Fechar o app para os containers nativos, e ele os reabre pelo nome na próxima execução. Na 2.9.3
          eles ainda são removidos na saída: sem reabrir por ID, virariam registros órfãos e invisíveis.
        </Notice>

        {/* Trocar a DLL é ação avançada e rara: fica no fim do bloco, depois do
            que a pessoa precisa ler, e em secundário — o ciano é da ação
            principal da tela, e aqui não existe uma. */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-4">
          <Button isDisabled={pickingSdk} size="sm" variant="secondary" onPress={() => void pickSdk()}>
            <FolderSearch className="size-4" />
            {pickingSdk ? 'Verificando…' : 'Escolher outra DLL…'}
          </Button>
          {sdkPath !== null && (
            <Button size="sm" variant="ghost" onPress={() => void useBundledSdk()}>
              <Undo2 className="size-4" />
              Usar a empacotada
            </Button>
          )}
        </div>
      </Group>

      <Group
        description="Limites da VM da sessão “WslcUi”. Campo vazio usa o padrão do WSL, e o valor só entra em vigor quando a sessão é criada."
        title="Tuning da sessão nativa"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <NumberInput
            hint="Núcleos visíveis dentro da sessão."
            label="CPUs"
            maxValue={128}
            placeholder="ex.: 2"
            value={cpuCount}
            onChange={setCpuCount}
          />
          <NumberInput
            hint="Limite de RAM da sessão, em MB."
            label="Memória"
            placeholder="ex.: 2048"
            value={memoryMb}
            onChange={setMemoryMb}
          />
          <NumberInput
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

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-4">
          <Button isDisabled={savingTuning || !native?.available} size="sm" onPress={() => void saveTuning()}>
            <Save className="size-4" />
            {savingTuning ? 'Salvando…' : 'Salvar tuning'}
          </Button>
          <Button
            className="ms-auto"
            isDisabled={!native?.available}
            size="sm"
            variant="danger-soft"
            onPress={() => void resetNative(loadEngine)}
          >
            <RotateCcw className="size-4" />
            Resetar sessão nativa
          </Button>
        </div>
      </Group>
    </>
  )
}
