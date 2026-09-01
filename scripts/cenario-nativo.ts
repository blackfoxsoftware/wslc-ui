/**
 * Prepara a sessão nativa "WslcUi" para o cenário de teste: imagens, uma tag
 * extra e os volumes VHDX. **Não cria containers** — veja o porquê abaixo.
 *
 * Por que existe um script separado do `cenario-demo.ps1`: os dois motores têm
 * STORAGE PRÓPRIO (`%LOCALAPPDATA%\wslc\sessions\…` na CLI,
 * `%LOCALAPPDATA%\wslc-ui\native-session\` no nativo). Nada que a CLI cria
 * aparece no motor nativo, e o `wslc.exe` não tem como endereçar a sessão do app
 * (não há flag de sessão em `list`/`run`) — a única porta de entrada do storage
 * nativo é o próprio SDK.
 *
 * POR QUE NÃO DÁ PARA SEMEAR CONTAINERS NATIVOS POR FORA (medido, não suposto):
 * o SDK preview não enumera containers. O app mantém um `registry` EM MEMÓRIA
 * (`native/containers.ts`) com os handles vivos, e `listNativeContainers` itera
 * esse Map — ou seja, cada processo só enxerga os containers que ele mesmo
 * criou. Um seeder externo cria containers de verdade, mas eles somem do mundo
 * observável assim que o processo sai. Imagens, tags e volumes ficam, porque
 * moram no storage.vhdx e são relidos pelo SDK a cada sessão.
 *
 * Então: containers do motor nativo precisam ser criados PELO APP, no diálogo
 * "Executar container". Este script deixa pronto tudo o que esse diálogo precisa
 * (imagens puxadas e volumes existindo), que é a parte demorada.
 *
 * O SDK aceita UM processo por sessão: rode com o app FECHADO.
 *
 *   npm run cenario:nativo
 *   npm run cenario:nativo -- --reset
 */
import type { StreamSink } from '../src/main/services/wslc/streams'
import { pullNativeImage, tagNativeImage } from '../src/main/services/wslc/native/image-ops'
import { locateWslcSdk } from '../src/main/services/wslc/native/locate'
import {
  listNativeImages,
  NATIVE_SESSION_NAME,
  releaseNativeSession,
  removeNativeImage
} from '../src/main/services/wslc/native/session'
import {
  createNativeVolume,
  deleteNativeVolume,
  listNativeVolumes
} from '../src/main/services/wslc/native/volumes'

const IMAGES = ['alpine:latest', 'busybox:latest', 'nginx:alpine']
const TAG = 'loja/web:1.0'

/** Os mesmos nomes do cenário da CLI, para os dois motores combinarem. */
const VOLUMES = [
  { name: 'loja-dados', sizeMb: 1024, fixed: false },
  { name: 'loja-cache', sizeMb: 512, fixed: false },
  { name: 'loja-vhd', sizeMb: 512, fixed: true, owner: { uid: 0, gid: 0 } }
]

const step = (text: string): void => console.log(`-> ${text}`)

/** Espera o stream de pull do SDK terminar, resumindo o progresso por camada. */
function awaitPull(ref: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastPct = -1
    const sink: StreamSink = {
      data: () => undefined,
      progress: (ev) => {
        const total = ev.layers.reduce((sum, l) => sum + l.total, 0)
        const done = ev.layers.reduce((sum, l) => sum + l.current, 0)
        const pct = total > 0 ? Math.floor((done / total) * 100) : 0
        // Só a cada 25%: o callback do SDK dispara centenas de vezes.
        if (pct >= lastPct + 25) {
          lastPct = pct
          console.log(`   ${ref} ${pct}%`)
        }
      },
      exit: (ev) => {
        if (ev.code === 0) resolve()
        else reject(new Error(`pull de ${ref} terminou com código ${ev.code}`))
      }
    }
    pullNativeImage(ref, sink)
  })
}

async function main(): Promise<void> {
  if (locateWslcSdk() === null) {
    console.error('wslcsdk.dll não encontrada — o motor nativo não está disponível nesta máquina.')
    process.exitCode = 1
    return
  }

  // oxlint-disable no-await-in-loop -- sequencial de propósito: o SDK serializa
  // por sessão, e um pull de cada vez mantém o progresso legível.
  if (process.argv.includes('--reset')) {
    step('removendo os volumes do cenário')
    for (const v of VOLUMES) await deleteNativeVolume(v.name)
    step(`removendo a tag ${TAG}`)
    await removeNativeImage(TAG)
    releaseNativeSession()
    console.log('\nCenário nativo desfeito (as imagens base ficam).')
    return
  }

  // ---------------------------------------------------------------- imagens
  const present = new Set((await listNativeImages()).map((i) => `${i.repository}:${i.tag}`))
  for (const ref of IMAGES) {
    if (present.has(ref)) {
      console.log(`   ${ref} já está na sessão`)
      continue
    }
    step(`baixando ${ref}`)
    await awaitPull(ref)
  }

  // Duas linhas com o mesmo IMAGE ID na view de Imagens, e um alvo para o rmi
  // por referência (que remove só a tag, não a imagem).
  step(`marcando nginx:alpine como ${TAG}`)
  await tagNativeImage('nginx:alpine', TAG)

  // ---------------------------------------------------------------- volumes
  // No nativo todo volume é um VHDX com tamanho — não existe o driver "guest".
  step('criando volumes VHDX')
  for (const v of VOLUMES) {
    await deleteNativeVolume(v.name)
    const res = await createNativeVolume(v.name, { sizeMb: v.sizeMb, fixed: v.fixed, owner: v.owner })
    if (!res.ok) throw new Error(`volume ${v.name}: ${res.stderr || res.stdout}`)
  }
  // oxlint-enable no-await-in-loop

  // ------------------------------------------------------------------ saída
  console.log('')
  step('estado final da sessão nativa')
  for (const i of await listNativeImages()) console.log(`   imagem  ${i.repository}:${i.tag}`)
  for (const v of await listNativeVolumes()) {
    const mb = v.sizeBytes === undefined ? '—' : `${Math.round(v.sizeBytes / 1024 / 1024)} MB`
    console.log(`   volume  ${v.name.padEnd(12)} ${mb}`)
  }

  releaseNativeSession()
  console.log(`\nSessão "${NATIVE_SESSION_NAME}" preparada. Abra o app no motor Nativo e crie os`)
  console.log('containers pelo diálogo "Executar container" — no nativo eles vivem no processo do app.')
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`\nFalhou: ${msg}`)
  if (/ALREADY_EXISTS|já está aberta/i.test(msg)) {
    console.error(`A sessão "${NATIVE_SESSION_NAME}" só aceita um processo — feche o app e rode de novo.`)
  }
  releaseNativeSession()
  process.exitCode = 1
})
