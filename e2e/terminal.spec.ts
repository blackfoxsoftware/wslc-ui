import { ENGINES, expect, test } from './fixtures/app'
import { runContainer } from './fixtures/actions'
import { closeSheet, row, sheet } from './fixtures/ui'

/**
 * Terminal embutido (xterm) dentro do container.
 *
 * O shell roda sem TTY no preview: a edição de linha é local e cada Enter
 * manda a linha inteira. O teste digita e confere o eco, que é o contrato
 * visível dessa limitação.
 */

const screen = (page: import('@playwright/test').Page) => page.locator('.xterm-rows')

for (const engine of ENGINES) {
  test.describe(`Terminal · motor ${engine}`, () => {
    test.use({ engine })

    test.beforeEach(async ({ page }) => {
      if (engine === 'native') {
        await runContainer(page, { name: 'web', image: /^nginx:latest$/ })
      }
    })

    test('abre, conecta e responde a um comando', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Terminal', exact: true }).click()

      await expect(sheet(page)).toBeVisible()
      // Exato: sem isso, o "Conectado a …" que o shell imprime também casa, e
      // o teste vira corrida entre o chip de status e a primeira linha do log.
      await expect(sheet(page).getByText('conectado', { exact: true })).toBeVisible()
      await expect(screen(page)).toContainText('Conectado a')

      await page.keyboard.type('whoami')
      await page.keyboard.press('Enter')
      await expect(screen(page)).toContainText('root')

      await page.keyboard.type('echo ola-e2e')
      await page.keyboard.press('Enter')
      await expect(screen(page)).toContainText('ola-e2e')

      await closeSheet(page)
    })

    test('só aparece em container em execução', async ({ page }) => {
      if (engine === 'native') {
        await runContainer(page, { name: 'parado', image: /^alpine:latest$/, detach: false })
      }
      const parado = engine === 'native' ? 'parado' : 'db'

      await expect(row(page, parado).getByRole('button', { name: 'Terminal', exact: true })).toHaveCount(0)
    })
  })
}

test.describe('Terminal · caminho triste', () => {
  test.use({ fail: ['terminal:open'] })

  test('a falha ao abrir aparece dentro do próprio terminal', async ({ page }) => {
    await row(page, 'web').getByRole('button', { name: 'Terminal', exact: true }).click()

    await expect(sheet(page)).toBeVisible()
    await expect(screen(page)).toContainText('Falha ao abrir o terminal')
    await expect(sheet(page).getByText('encerrado')).toBeVisible()
  })
})
