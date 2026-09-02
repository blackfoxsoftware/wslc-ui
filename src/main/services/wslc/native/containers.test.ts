import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupNativeContainers,
  execNativeContainer,
  inspectNativeContainer,
  killNativeContainer,
  listNativeContainers,
  nativeContainerAction,
  nativeContainerCount,
  restartNativeSession,
  runNativeContainer,
  streamNativeLogs
} from './containers'
import { locateWslcSdk } from './locate'
import { acquireNativeSession, releaseNativeSession, setNativeSessionTuning } from './session'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Nomes únicos por execução: registros de container órfãos persistem no storage
// da sessão se um run for morto no meio (limitação do SDK preview).
const uniq = Date.now().toString(36)

// oxlint-disable no-await-in-loop, no-unmodified-loop-condition -- polling intencional (callbacks mudam o estado)

/**
 * Remove TUDO da sessão nativa.
 *
 * Precisa existir porque, na ABI 2.9.9, fechar o app deixou de apagar
 * containers — eles são reabertos na execução seguinte, de propósito. Ótimo
 * para quem usa, péssimo para um teste que conta containers: sem limpar
 * ANTES, sobra de execução anterior entra na conta.
 */
const removerTodos = async (): Promise<void> => {
  for (const c of await listNativeContainers(true)) {
    // oxlint-disable-next-line no-await-in-loop -- sequencial (handles nativos)
    await nativeContainerAction('remove', c.id)
  }
}

// Integração real: cria containers de verdade na sessão "WslcUi" (exige a
// wslcsdk.dll e a imagem alpine:latest já puxada para a sessão nativa).
describe.skipIf(locateWslcSdk() === null)('containers nativos (integração real via FFI)', () => {
  beforeAll(removerTodos, 60_000)

  afterAll(async () => {
    await removerTodos()
    await cleanupNativeContainers()
    releaseNativeSession()
  }, 60_000)

  // A limitação levantada pela ABI 2.9.9: antes, fechar o app apagava os
  // containers nativos, porque sem WslcOpenContainer eles virariam órfãos
  // invisíveis. Aqui o ciclo inteiro é exercitado num processo só —
  // cleanup solta os handles e esvazia o registro em memória, e a listagem
  // seguinte precisa trazer o container de volta do arquivo.
  it('container sobrevive ao fechamento do app e é reaberto', { timeout: 90_000 }, async () => {
    const nome = `wslcuireabre${uniq}`
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: nome,
      command: 'sh -c "sleep 60"',
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)

    const { sdk } = await acquireNativeSession()
    if (!sdk.abi.modern) return // ABI 2.9.3: o comportamento correto é apagar mesmo

    // Fechar o app: com a ABI nova, isto NÃO apaga — só solta os handles.
    await cleanupNativeContainers()
    expect(nativeContainerCount()).toBe(0)

    // Próxima execução: a listagem reabre pelo que ficou lembrado em disco.
    const depois = await listNativeContainers(true)
    const reaberto = depois.find((c) => c.name === nome)
    expect(reaberto, `container ${nome} não voltou: ${depois.map((c) => c.name).join(', ')}`).toBeDefined()

    // E dá para operá-lo de novo — reabrir sem poder agir seria inútil.
    const removido = await nativeContainerAction('remove', nome)
    expect(removido.ok, removido.stderr).toBe(true)
    expect((await listNativeContainers(true)).some((c) => c.name === nome)).toBe(false)
  })

  it('run → logs por callback → estado exited com código → remove', { timeout: 60_000 }, async () => {
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: `wslcuitest1${uniq}`,
      command: 'sh -c "echo ola-do-teste; exit 5"',
      env: ['FOO=bar'],
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)
    const shortId = res.stdout
    expect(shortId).toMatch(/^[0-9a-f]{12}$/)

    // espera o init process sair E o exit callback ser entregue (o estado
    // pode virar EXITED alguns ms antes do callback com o código)
    let listed = await listNativeContainers(true)
    for (let i = 0; i < 60 && listed.find((c) => c.id === shortId)?.status !== 'Encerrado (código 5)'; i++) {
      await sleep(500)
      listed = await listNativeContainers(true)
    }
    const entry = listed.find((c) => c.id === shortId)
    expect(entry?.state).toBe('exited')
    expect(entry?.status).toBe('Encerrado (código 5)')
    expect(entry?.name).toBe(`wslcuitest1${uniq}`)

    // logs capturados pelos callbacks, servidos via stream
    const chunks: string[] = []
    let exited = false
    streamNativeLogs(shortId, {
      data: (ev) => chunks.push(ev.chunk),
      exit: () => {
        exited = true
      }
    })
    for (let i = 0; i < 20 && !exited; i++) await sleep(100)
    expect(chunks.join('')).toContain('ola-do-teste')
    expect(exited).toBe(true)

    const removed = await nativeContainerAction('remove', shortId)
    expect(removed.ok, removed.stderr).toBe(true)
    expect((await listNativeContainers(true)).find((c) => c.id === shortId)).toBeUndefined()
  })

  it('exec roda comando em container em execução e captura stdout', { timeout: 60_000 }, async () => {
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: `wslcuitest2${uniq}`,
      command: 'sleep 30',
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)
    const shortId = res.stdout

    const exec = await execNativeContainer(shortId, 'echo ping-$FOO && uname -s')
    expect(exec.ok, exec.stderr).toBe(true)
    expect(exec.stdout).toContain('ping-')
    expect(exec.stdout).toContain('Linux')

    const inspect = await inspectNativeContainer(shortId)
    expect(inspect.ok).toBe(true)
    expect(inspect.stdout.length).toBeGreaterThan(100)

    const removed = await nativeContainerAction('remove', shortId)
    expect(removed.ok, removed.stderr).toBe(true)
    expect(nativeContainerCount()).toBe(0)
  })

  it('ação em id desconhecido devolve erro claro', async () => {
    const res = await nativeContainerAction('stop', 'naoexiste')
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('não encontrado')
  })

  it('hostname/domain/workdir/entrypoint no run e kill nativo (SIGKILL)', { timeout: 60_000 }, async () => {
    const res = await runNativeContainer({
      image: 'alpine:latest',
      name: `wslcuitest3${uniq}`,
      entrypoint: 'sh -c',
      command: '"hostname; cat /proc/sys/kernel/domainname; pwd; sleep 60"',
      hostname: 'testhost',
      domainname: 'teste.local',
      workdir: '/etc',
      detach: true,
      rm: false
    })
    expect(res.ok, res.stderr).toBe(true)
    const shortId = res.stdout

    // logs devem trazer hostname custom, domínio e o workdir aplicados
    const chunks: string[] = []
    streamNativeLogs(shortId, { data: (ev) => chunks.push(ev.chunk), exit: () => undefined })
    for (let i = 0; i < 40 && !chunks.join('').includes('/etc'); i++) await sleep(250)
    const logs = chunks.join('')
    expect(logs).toContain('testhost')
    expect(logs).toContain('teste.local')
    expect(logs).toContain('/etc')

    // kill imediato: o init (sleep 60) morre já
    const killed = await killNativeContainer(shortId)
    expect(killed.ok, killed.stderr).toBe(true)
    let listed = await listNativeContainers(true)
    for (let i = 0; i < 40 && listed.find((c) => c.id === shortId)?.state !== 'exited'; i++) {
      await sleep(250)
      listed = await listNativeContainers(true)
    }
    expect(listed.find((c) => c.id === shortId)?.state).toBe('exited')

    const removed = await nativeContainerAction('remove', shortId)
    expect(removed.ok, removed.stderr).toBe(true)
  })

  it('kill com sinal desconhecido devolve erro claro sem chamar o SDK', async () => {
    const res = await killNativeContainer('naoexiste')
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('não encontrado')
    // container existente + sinal inválido é coberto pelo caminho puro do mapa
  })

  it(
    'tuning de sessão: restart aplica cpuCount=1 (nproc) e volta ao padrão',
    { timeout: 180_000 },
    async () => {
      setNativeSessionTuning({ cpuCount: 1 })
      try {
        const restarted = await restartNativeSession()
        expect(restarted.ok, restarted.stderr).toBe(true)

        const run = await runNativeContainer({
          image: 'alpine:latest',
          name: `wslcuitest4${uniq}`,
          command: 'nproc',
          detach: true,
          rm: false
        })
        expect(run.ok, run.stderr).toBe(true)
        const shortId = run.stdout
        const chunks: string[] = []
        streamNativeLogs(shortId, { data: (ev) => chunks.push(ev.chunk), exit: () => undefined })
        for (let i = 0; i < 40 && chunks.join('').trim() === ''; i++) await sleep(250)
        expect(chunks.join('').trim()).toBe('1')
        await nativeContainerAction('remove', shortId)
      } finally {
        // restaura os padrões do WSL para os próximos testes/sessões
        setNativeSessionTuning({})
        await restartNativeSession()
      }
    }
  )
})
