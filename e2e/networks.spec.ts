import { expect, test } from './fixtures/app'
import {
  cancelConfirm,
  chooseOption,
  closeSheet,
  confirm,
  expectAlert,
  expectToast,
  fillField,
  menuAction,
  modal,
  row,
  sheet,
  toggleSwitch
} from './fixtures/ui'

/**
 * Redes nomeadas. São um recurso da CLI nos dois motores: o SDK nativo só
 * conhece NONE/BRIDGED, e a view avisa isso quando o motor nativo está ativo.
 */

const goToNetworks = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('link', { name: 'Redes', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Redes' })).toBeVisible()
}

test.describe('Redes', () => {
  test.beforeEach(async ({ page }) => {
    await goToNetworks(page)
  })

  test('lista as redes existentes', async ({ page }) => {
    await expect(row(page, 'frontend')).toContainText('bridge')
    await expect(page.getByText(/\d+ rede/)).toBeVisible()
  })

  test('cria uma rede com sub-rede, gateway e labels', async ({ page }) => {
    await page.getByRole('button', { name: 'Criar rede' }).click()
    const dialog = modal(page)

    await fillField(dialog, 'Nome da rede', 'backend')
    await fillField(dialog, 'Sub-rede', '172.20.0.0/16')
    await fillField(dialog, 'Gateway', '172.20.0.1')
    await fillField(dialog, 'Labels', 'app=site, env=dev')
    await toggleSwitch(dialog, 'Rede interna')
    await dialog.getByRole('button', { name: 'Criar rede' }).click()

    await expectToast(page, 'Rede "backend" criada.')
    await expect(row(page, 'backend')).toBeVisible()
  })

  test('recusa um nome que já existe', async ({ page }) => {
    await page.getByRole('button', { name: 'Criar rede' }).click()
    await fillField(modal(page), 'Nome da rede', 'frontend')
    await modal(page).getByRole('button', { name: 'Criar rede' }).click()

    await expectToast(page, /rede já existe/)
    await expect(modal(page)).toBeVisible()
  })

  test('inspeciona uma rede', async ({ page }) => {
    await row(page, 'frontend').getByRole('button', { name: 'Inspecionar rede' }).click()

    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByText('"Subnet": "172.18.0.0/16"')).toBeVisible()
    await closeSheet(page)
  })

  test('conecta e desconecta um container', async ({ page }) => {
    await menuAction(page, 'Mais ações da rede', 'Conectar container', row(page, 'frontend'))
    await chooseOption(page, modal(page).locator('[data-slot="select-trigger"]').first(), /^web/)
    await modal(page).getByRole('button', { name: 'Conectar' }).click()

    await expectToast(page, 'Container conectado à rede "frontend".')

    await menuAction(page, 'Mais ações da rede', 'Desconectar container', row(page, 'frontend'))
    await chooseOption(page, modal(page).locator('[data-slot="select-trigger"]').first(), /^web/)
    await modal(page).getByRole('button', { name: 'Desconectar' }).click()

    await expectToast(page, 'Container desconectado da rede "frontend".')
  })

  test('remover pede confirmação e cancelar não remove', async ({ page }) => {
    await menuAction(page, 'Mais ações da rede', 'Remover', row(page, 'frontend'))
    await cancelConfirm(page)
    await expect(row(page, 'frontend')).toBeVisible()

    await menuAction(page, 'Mais ações da rede', 'Remover', row(page, 'frontend'))
    await confirm(page, 'Remover')

    await expectToast(page, 'Rede "frontend" removida.')
    await expect(page.getByText('Nenhuma rede')).toBeVisible()
  })

  test('limpeza das redes sem uso é confirmada pela UI', async ({ page }) => {
    // A CLI apaga direto (network prune não tem --force): a confirmação é nossa.
    await menuAction(page, 'Mais ações', 'Remover redes sem uso')
    await confirm(page, 'Remover sem uso')

    await expectToast(page, /Redes sem containers removidas|Excluído/)
  })
})

test.describe('Redes · motor nativo', () => {
  test.use({ engine: 'native' })

  test('avisa que containers nativos não participam das redes nomeadas', async ({ page }) => {
    await goToNetworks(page)

    await expect(page.getByText('Redes nomeadas são um recurso da CLI')).toBeVisible()
    // A lista continua sendo a da CLI, e continua utilizável.
    await expect(row(page, 'frontend')).toBeVisible()
  })
})

test.describe('Redes · caminhos tristes', () => {
  test.describe('listagem indisponível', () => {
    test.use({ fail: ['networks:list'] })

    test('mostra o erro na própria view', async ({ page }) => {
      await goToNetworks(page)
      await expectAlert(page, /Não foi possível listar as redes/)
    })
  })

  test.describe('criação recusada', () => {
    test.use({ fail: ['networks:create'] })

    test('avisa e mantém o diálogo aberto', async ({ page }) => {
      await goToNetworks(page)
      await page.getByRole('button', { name: 'Criar rede' }).click()
      await fillField(modal(page), 'Nome da rede', 'backend')
      await modal(page).getByRole('button', { name: 'Criar rede' }).click()

      await expectToast(page, /Falha ao criar a rede "backend"/)
      await expect(modal(page)).toBeVisible()
    })
  })

  test.describe('conexão recusada', () => {
    test.use({ fail: ['networks:connect'] })

    test('avisa e mantém o diálogo aberto', async ({ page }) => {
      await goToNetworks(page)
      await menuAction(page, 'Mais ações da rede', 'Conectar container', row(page, 'frontend'))
      await chooseOption(page, modal(page).locator('[data-slot="select-trigger"]').first(), /^web/)
      await modal(page).getByRole('button', { name: 'Conectar' }).click()

      await expectToast(page, /Falha ao conectar o container/)
      await expect(modal(page)).toBeVisible()
    })
  })

  test.describe('remoção recusada', () => {
    test.use({ fail: ['networks:remove'] })

    test('a rede continua na lista', async ({ page }) => {
      await goToNetworks(page)
      await menuAction(page, 'Mais ações da rede', 'Remover', row(page, 'frontend'))
      await confirm(page, 'Remover')

      await expectToast(page, /Falha ao remover "frontend"/)
      await expect(row(page, 'frontend')).toBeVisible()
    })
  })
})
