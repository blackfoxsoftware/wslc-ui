import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
 * Então este script abre o .exe de verdade e confere justamente isso: que o
 * motor nativo achou a DLL, e que ela veio de dentro do pacote.
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
  if (!status.available) problemas.push(`SDK indisponível: ${status.detail}`)
  if (status.source !== 'bundled') problemas.push(`DLL veio de "${status.source}", não do pacote`)
  if (status.dllPath !== null && !/resources/i.test(status.dllPath)) {
    problemas.push(`DLL fora de resources/: ${status.dllPath}`)
  }
  if (status.abi === null) problemas.push('ABI não detectada')

  if (problemas.length > 0) {
    console.error(`\nFumaça falhou (${problemas.length}):`)
    for (const p of problemas) console.error(`  - ${p}`)
    process.exitCode = 1
  } else {
    console.log(`\nOK: app empacotado abriu, DLL ${status.abi} carregada de resources/.`)
  }
} finally {
  await app.close().catch(() => undefined)
}
