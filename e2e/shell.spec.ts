import { expect, test } from './fixtures/app'
import { expectToast, goto, openLogsPanel } from './fixtures/ui'

/** A moldura do app: navegação, janela e o painel de logs do rodapé. */

test.describe('Casca do app', () => {
  test('abre em Containers e navega por todas as views', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible()

    // Sequencial de propósito: é uma navegação, um clique depois do outro.
    // oxlint-disable no-await-in-loop
    for (const view of ['Imagens', 'Volumes', 'Redes', 'Sistema', 'Containers'] as const) {
      await goto(page, view)
    }
    // oxlint-enable no-await-in-loop
  })

  test('recolhe e expande o menu lateral', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navegação principal' })
    await expect(nav.getByText('Containers')).toBeVisible()

    await page.getByRole('button', { name: 'Recolher menu' }).click()
    // Recolhido, sobra só o ícone — o rótulo sai do fluxo.
    await expect(nav.getByText('Containers')).toHaveCount(0)

    await page.getByRole('button', { name: 'Expandir menu' }).click()
    await expect(nav.getByText('Containers')).toBeVisible()
  })

  test('maximiza e restaura pela barra de título', async ({ page }) => {
    await page.getByRole('button', { name: 'Maximizar' }).click()
    await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible()

    await page.getByRole('button', { name: 'Restaurar' }).click()
    await expect(page.getByRole('button', { name: 'Maximizar' })).toBeVisible()
  })

  test('minimiza e a janela volta visível', async ({ page, app }) => {
    await page.getByRole('button', { name: 'Minimizar' }).click()
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()))
      .toBe(true)

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible()
  })

  test('painel de logs: filtra, mostra vazio e limpa', async ({ page }) => {
    await openLogsPanel(page)
    // O app registra o próprio início — sempre há ao menos essa entrada.
    await expect(page.getByText(/wslc-ui .* iniciado/)).toBeVisible()

    await page.getByRole('searchbox', { name: 'Filtrar mensagens' }).fill('xyz-nada-casa-com-isso')
    await expect(page.getByText('Nenhuma entrada com os filtros atuais.')).toBeVisible()

    await page.getByRole('searchbox', { name: 'Filtrar mensagens' }).fill('')
    await expect(page.getByText(/wslc-ui .* iniciado/)).toBeVisible()

    await page.getByRole('button', { name: 'Limpar logs' }).click()
    await expectToast(page, 'Logs limpos')
    await expect(page.getByText('Nenhuma entrada com os filtros atuais.')).toBeVisible()
  })

  test('painel de logs recebe entradas novas ao vivo', async ({ page }) => {
    await openLogsPanel(page)
    await page.getByRole('button', { name: 'Limpar logs' }).click()

    // Efeito externo: em modo demo o app registra em vez de abrir o Explorer.
    await page.getByRole('button', { name: 'Abrir pasta de logs' }).click()
    await expect(page.getByText(/\(demo\) pasta aberta:/)).toBeVisible()
  })

  test('painel de logs recolhe', async ({ page }) => {
    await openLogsPanel(page)
    await page.getByRole('button', { name: 'Recolher logs' }).click()
    await expect(page.getByRole('searchbox', { name: 'Filtrar mensagens' })).toHaveCount(0)
  })
})
