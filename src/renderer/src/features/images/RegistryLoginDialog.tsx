import { useState } from 'react'
import { AppModal, Button, TextInput, toast } from '@/design'

interface Props {
  nativeEngine: boolean
  onClose: () => void
}

/**
 * Login em registry de containers. No motor nativo as credenciais são
 * validadas por WslcSessionAuthenticate e ficam em memória (valem para
 * push/pull até fechar o app); no motor CLI o `wslc login` guarda no perfil.
 */
export default function RegistryLoginDialog({ nativeEngine, onClose }: Props): React.JSX.Element {
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = username.trim().length > 0 && password.length > 0

  const submit = async (): Promise<void> => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      const res = await window.wslcApi.registryLogin(server.trim(), username.trim(), password)
      if (res.ok) {
        toast.success(`Login em ${server.trim() || 'Docker Hub'} OK.`)
        onClose()
      } else {
        toast.danger(res.stderr || res.stdout || 'Falha no login.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppModal
      description={
        nativeEngine
          ? 'As credenciais são validadas no registry e ficam em memória: valem para push e pull até fechar o app.'
          : 'Autentica a CLI do wslc no registry. As credenciais ficam no perfil da CLI.'
      }
      footer={
        <>
          <Button isDisabled={submitting} variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={!canSubmit || submitting} onPress={() => void submit()}>
            {submitting ? 'Autenticando…' : 'Entrar'}
          </Button>
        </>
      }
      size="md"
      title="Login em registry"
      onClose={onClose}
    >
      <TextInput
        autoFocus
        hint="Vazio usa o Docker Hub."
        label="Servidor"
        placeholder="ex.: registry.example.com:5000"
        value={server}
        onChange={setServer}
      />
      <TextInput label="Usuário" value={username} onChange={setUsername} />
      <TextInput
        hint="Aceita um personal access token (PAT) no lugar da senha."
        label="Senha ou token"
        type="password"
        value={password}
        onChange={setPassword}
        onSubmitKey={() => void submit()}
      />
    </AppModal>
  )
}
