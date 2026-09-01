import { useState } from 'react'
import { AppModal, Button, TextInput, toast } from '@/design'

interface Props {
  nativeEngine: boolean
  onClose: () => void
}

/** `wslc logout` (CLI) / descarte das credenciais em memória (nativo). */
export default function RegistryLogoutDialog({ nativeEngine, onClose }: Props): React.JSX.Element {
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.wslcApi.registryLogout(server.trim())
      if (res.ok) {
        toast.success(res.stdout.trim() || `Logout de ${server.trim() || 'docker.io'} OK.`)
        onClose()
      } else {
        toast.danger(res.stderr || res.stdout || 'Falha no logout.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppModal
      description={
        nativeEngine
          ? 'Descarta as credenciais guardadas em memória nesta execução do app.'
          : 'Remove as credenciais salvas pelo login da CLI.'
      }
      footer={
        <>
          <Button isDisabled={busy} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={busy} onPress={() => void submit()}>
            {busy ? 'Saindo…' : 'Fazer logout'}
          </Button>
        </>
      }
      size="md"
      title="Logout de registry"
      onClose={onClose}
    >
      <TextInput
        autoFocus
        hint="Vazio usa o registry padrão, o Docker Hub."
        label="Registry"
        placeholder="ex.: registry.example.com:5000"
        value={server}
        onChange={setServer}
        onSubmitKey={() => void submit()}
      />
    </AppModal>
  )
}
