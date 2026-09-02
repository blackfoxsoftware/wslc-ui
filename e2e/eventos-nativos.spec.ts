import { expect, test } from './fixtures/app'
import { runContainer } from './fixtures/actions'
import { closeSheet, expectToast, fillField, openTab, row, sheet } from './fixtures/ui'

/**
 * Eventos que só o motor nativo emite: crash dump de um processo Linux dentro
 * do container e o fim inesperado da sessão "WslcUi".
 *
 * No dublê os dois são disparados por um comando reservado no exec, para o
 * teste não depender de derrubar nada de verdade.
 */

test.use({ engine: 'native' })

test.beforeEach(async ({ page }) => {
  await runContainer(page, { name: 'web', image: /^nginx:latest$/ })
  await row(page, 'web').getByTitle('Ver detalhes').click()
  await expect(sheet(page)).toBeVisible()
})

/** Roda um comando no container pelo painel de detalhes. */
async function exec(page: import('@playwright/test').Page, command: string): Promise<void> {
  await fillField(sheet(page), 'Comando a executar', command)
  await sheet(page).getByRole('button', { name: 'Exec', exact: true }).click()
}

test('crash de um processo avisa e leva ao arquivo de dump', async ({ page }) => {
  await exec(page, 'crash')

  await expectToast(page, /Processo travou num container: \/bin\/busybox/)
  await expectToast(page, /SIGSEGV/)

  await closeSheet(page)
  await page.getByRole('button', { name: 'Mostrar dump' }).click()

  await page.getByRole('button', { name: 'Expandir logs' }).click()
  await expect(page.getByText(/\(demo\) arquivo revelado no Explorer:.*\.dmp/)).toBeVisible()
})

test('sessão nativa encerrada por fora avisa que será recriada', async ({ page }) => {
  await exec(page, 'end-session')

  await expectToast(page, /Sessão nativa encerrada \(o WSL foi desligado\)/)
  await expectToast(page, /Será recriada na próxima operação/)

  await closeSheet(page)
  // O estado do motor é recarregado: a sessão deixa de constar como ativa.
  // O estado dela mora na aba Motor de Sistema.
  await page.getByRole('link', { name: 'Sistema', exact: true }).click()
  await openTab(page, 'Motor')
  await expect(page.getByText('criada na primeira operação', { exact: true })).toBeVisible()
})
