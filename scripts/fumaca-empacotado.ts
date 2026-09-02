import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import type { WslcApi } from '../src/shared/ipc/api'

/**
 * Teste de fumaça do app EMPACOTADO — o que a suíte E2E não cobre.
 *
 * O E2E roda contra `out/`, com o Electron do node_modules e o projeto inteiro
 * no disco. O instalador é outro mundo: o código vive dentro do asar, o koffi
 * precisa estar desempacotado para o dlopen funcionar, e a wslcsdk.dll deixa de
 * estar em `vendor/` para estar em `resources/`. Cada uma dessas três coisas
 * quebra sozinha, sem quebrar nada no E2E.
 *
 * Então este script abre o .exe de verdade e confere justamente isso: que a
 * DLL veio de dentro do pacote, que a chamada CHEGOU nela, e que o app sabe
 * onde procurar atualização.
 *
 * O que ele NÃO afirma é que o motor nativo funciona — isso depende de haver
 * WSL na máquina, e runner de CI não tem. Quem mede aquilo são os testes de
 * integração, que só rodam onde o SDK responde (ver isNativeUsable).
 *
 *   node scripts/fumaca-empacotado.ts "dist/win-unpacked/WSLC UI.exe"
 */

const exe = process.argv[2]
if (!exe) {
  console.error('uso: node scripts/fumaca-empacotado.ts <caminho do .exe>')
  process.exit(1)
}

const app = await electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${mkdtempSync(join(tmpdir(), 'wslc-fumaca-'))}`]
})

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // `globalThis` e não `window`: este script é typechecado com a lib de node,
  // que não conhece DOM. O código roda no renderer de qualquer forma.
  const status = await page.evaluate(() =>
    (globalThis as unknown as { wslcApi: WslcApi }).wslcApi.getNativeStatus()
  )
  console.log(JSON.stringify(status, null, 2))

  const problemas: string[] = []

  // --- problemas de EMPACOTAMENTO: valem em qualquer máquina ---

  if (status.dllPath === null) problemas.push('a DLL não foi encontrada dentro do pacote')
  else if (!/resources/i.test(status.dllPath)) problemas.push(`DLL fora de resources/: ${status.dllPath}`)
  if (status.source !== 'bundled') problemas.push(`DLL veio de "${status.source}", não do pacote`)

  // O auto-updater depende de um arquivo que só existe no pacote: sem o
  // app-update.yml em resources/, o app abre normalmente e nunca descobre que
  // saiu versão nova — falha silenciosa, visível só uma release depois.
  if (!existsSync(join(dirname(exe), 'resources', 'app-update.yml'))) {
    problemas.push('resources/app-update.yml não foi embutido: o auto-updater não teria onde procurar')
  }

  const update = await page.evaluate(() =>
    (globalThis as unknown as { wslcApi: WslcApi }).wslcApi.updateStatus()
  )
  if (update.mode !== 'installer') {
    problemas.push(`o updater se vê como "${update.mode}", e este build é o instalado`)
  }

  // Um HRESULT na mensagem prova que a chamada CHEGOU na DLL — ou seja, o koffi
  // carregou de fora do asar e os bindings casaram. Sem WSL a chamada falha
  // (0x80070032, ERROR_NOT_SUPPORTED), e tudo bem; o que não pode é falhar
  // ANTES, com erro de módulo, que aí é empacotamento quebrado.
  const respondeu = status.available || /0x[0-9a-f]{8}/i.test(status.detail)
  if (!respondeu) problemas.push(`o SDK sequer respondeu: ${status.detail}`)

  // Se o motor nativo está de fato USÁVEL é outra pergunta, e não é desta
  // fumaça: depende de haver WSL na máquina, coisa que runner de CI não tem.
  // Quem mede isso são os testes de integração, que rodam onde há WSL.

  if (problemas.length > 0) {
    console.error(`\nFumaça falhou (${problemas.length}):`)
    for (const p of problemas) console.error(`  - ${p}`)
    process.exitCode = 1
  } else {
    console.log(
      `\nOK: app empacotado abriu, alcançou a DLL em resources/ e sabe onde procurar atualização.` +
        (status.available
          ? ` Motor nativo disponível, ABI ${status.abi}.`
          : ` Motor nativo não exercitável aqui: ${status.detail}`)
    )
  }
} finally {
  await app.close().catch(() => undefined)
}
