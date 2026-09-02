/**
 * Cobertura de cada motor, recurso por recurso.
 *
 * Isto era um parágrafo de oito linhas na view. Parágrafo é o pior formato
 * possível para a pergunta que a pessoa tem aqui — "se eu trocar de motor,
 * perco o quê?" —, porque obriga a ler tudo para achar UMA linha. Como
 * matriz, a resposta é uma varredura de olho.
 *
 * A fonte é o roteamento real em `src/main/ipc/index.ts`: cada `false` abaixo
 * corresponde a um canal que devolve erro, lista vazia ou vai sempre pela CLI
 * quando o motor nativo está ativo. Mudou o roteamento, muda esta tabela.
 */
export interface Capability {
  feature: string
  /** A ressalva que o `true`/`false` sozinho não conta. */
  detail?: string
  cli: boolean
  native: boolean
}

export const CAPABILITIES: Capability[] = [
  {
    feature: 'Containers: executar, parar, remover, kill',
    cli: true,
    native: true
  },
  {
    feature: 'Terminal, exec e inspect',
    cli: true,
    native: true
  },
  {
    feature: 'Logs',
    detail:
      'Cauda, carimbo de hora e recorte por data são flags da CLI; no nativo o log chega inteiro por callback.',
    cli: true,
    native: true
  },
  {
    feature: 'Imagens: listar, pull, push, tag, remover',
    detail: 'Progresso por camada nos dois motores.',
    cli: true,
    native: true
  },
  {
    feature: 'Login e logout em registry',
    detail:
      'A CLI grava no config do wslc; o nativo guarda na sessão, e a credencial sai quando ela termina.',
    cli: true,
    native: true
  },
  {
    feature: 'Carregar tarball (load e import)',
    cli: true,
    native: true
  },
  {
    feature: 'Volumes VHDX',
    detail: 'Labels de volume são metadados da CLI: pelo SDK o volume é só o .vhdx.',
    cli: true,
    native: true
  },
  {
    feature: 'Aviso de crash dump',
    detail: 'Processo que morre dentro de um container gera um .dmp — só o SDK reporta o caminho.',
    cli: false,
    native: true
  },
  {
    feature: 'Build de imagem',
    cli: true,
    native: false
  },
  {
    feature: 'Salvar e exportar (save, export)',
    cli: true,
    native: false
  },
  {
    feature: 'Copiar arquivos (container cp)',
    detail: 'Nenhuma das 62 funções do header 2.9.9 copia arquivo.',
    cli: true,
    native: false
  },
  {
    feature: 'Uso de CPU e memória',
    cli: true,
    native: false
  },
  {
    feature: 'Redes nomeadas',
    detail: 'Container nativo fica sempre na bridge (NAT) do WSL: o SDK só conhece NONE e BRIDGED.',
    cli: true,
    native: false
  },
  {
    feature: 'Limpar volumes sem uso (prune)',
    detail: 'O SDK não rastreia quem usa o volume, então a remoção é uma por uma.',
    cli: true,
    native: false
  }
]
