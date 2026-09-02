import { ENGINES, expect, test } from './fixtures/app'
import {
  chooseOption,
  clearField,
  closeSheet,
  confirm,
  expectAlert,
  expectToast,
  fillField,
  fillNumber,
  fillTags,
  menuAction,
  modal,
  row,
  sheet
} from './fixtures/ui'

/**
 * Volumes. Na CLI são volumes nomeados comuns; no motor nativo são discos
 * VHDX da sessão, com tamanho, tipo e dono — e sem prune, porque o SDK não
 * rastreia uso.
 */

const goToVolumes = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('link', { name: 'Volumes', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes' })).toBeVisible()
}

/** O volume que já existe em cada motor. */
const SEED = { cli: 'pgdata', native: 'dados-nativos' } as const

for (const engine of ENGINES) {
  test.describe(`Volumes · motor ${engine}`, () => {
    test.use({ engine })

    test.beforeEach(async ({ page }) => {
      await goToVolumes(page)
    })

    test('lista os volumes da sessão', async ({ page }) => {
      await expect(row(page, SEED[engine])).toBeVisible()
    })

    test('cria um volume', async ({ page }) => {
      await page.getByRole('button', { name: 'Criar volume' }).click()
      const dialog = modal(page)
      await fillField(dialog, 'Nome do volume', 'e2e-dados')

      if (engine === 'native') {
        await fillNumber(dialog, 'Tamanho', '2048')
        await chooseOption(page, dialog.locator('[data-slot="select-trigger"]').first(), 'Fixo')
        await fillNumber(dialog, 'uid do dono', '1000')
        await fillNumber(dialog, 'gid do dono', '1000')
      }

      await dialog.getByRole('button', { name: 'Criar volume' }).click()
      await expectToast(page, 'Volume "e2e-dados" criado.')
      await expect(row(page, 'e2e-dados')).toBeVisible()
    })

    test('recusa um nome que já existe', async ({ page }) => {
      await page.getByRole('button', { name: 'Criar volume' }).click()
      await fillField(modal(page), 'Nome do volume', SEED[engine])
      await modal(page).getByRole('button', { name: 'Criar volume' }).click()

      await expectToast(page, /volume já existe/)
      await expect(modal(page)).toBeVisible()
    })

    test('inspeciona um volume', async ({ page }) => {
      await row(page, SEED[engine]).getByRole('button', { name: 'Inspecionar volume' }).click()

      await expect(sheet(page)).toBeVisible()
      await expect(sheet(page).getByText(SEED[engine]).first()).toBeVisible()
      await closeSheet(page)
    })

    test('remove um volume depois de confirmar', async ({ page }) => {
      await row(page, SEED[engine]).getByRole('button', { name: 'Remover volume' }).click()
      await confirm(page, 'Remover')

      await expectToast(page, `Volume "${SEED[engine]}" removido.`)
      await expect(page.getByRole('row').filter({ hasText: SEED[engine] })).toHaveCount(0)
    })

    test('remove todos os volumes e mostra o estado vazio', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Remover todos os volumes')
      await confirm(page, 'Remover tudo')

      await expectToast(page, /volume\(s\) removido\(s\)/)
      await expect(page.getByText('Nenhum volume')).toBeVisible()
    })
  })
}

test.describe('Volumes · diferenças entre os motores', () => {
  // A wslc 2.9.9 passou a criar VHDX pela CLI (`volume create -d vhd -o
  // SizeBytes=…`), com as mesmas opções do SDK. Antes disso o disco virtual só
  // existia no motor nativo, e o diálogo nem mostrava os campos aqui.
  test('na CLI dá para escolher o driver vhd e os campos do disco aparecem', async ({ page }) => {
    await goToVolumes(page)
    await page.getByRole('button', { name: 'Criar volume' }).click()
    const dialog = modal(page)

    await expect(dialog.getByLabel('Tamanho')).toHaveCount(0)

    await fillField(dialog, 'Nome do volume', 'e2e-vhd')
    await chooseOption(page, dialog.locator('[data-slot="select-trigger"]').first(), 'vhd')
    await fillNumber(dialog, 'Tamanho', '512')

    await dialog.getByRole('button', { name: 'Criar volume' }).click()
    await expectToast(page, 'Volume "e2e-vhd" criado.')
    await expect(row(page, 'e2e-vhd')).toContainText('vhd')
  })

  // -l entrou no `volume create` da 2.9.9. O SDK não guarda metadados, então
  // o campo não existe no motor nativo.
  test('na CLI dá para rotular o volume, e o inspect mostra o rótulo', async ({ page }) => {
    await goToVolumes(page)
    await page.getByRole('button', { name: 'Criar volume' }).click()
    const dialog = modal(page)

    await fillField(dialog, 'Nome do volume', 'e2e-rotulado')
    await fillTags(dialog, 'Labels', 'app=site', 'env=dev')
    await dialog.getByRole('button', { name: 'Criar volume' }).click()
    await expectToast(page, 'Volume "e2e-rotulado" criado.')

    await row(page, 'e2e-rotulado').getByRole('button', { name: 'Inspecionar volume' }).click()
    await expect(sheet(page).getByText('"app": "site"')).toBeVisible()
    await closeSheet(page)
  })

  test('na CLI o volume tem escopo e existe limpeza dos sem uso', async ({ page }) => {
    await goToVolumes(page)
    await expect(page.getByRole('columnheader', { name: 'Escopo' })).toBeVisible()

    await menuAction(page, 'Mais ações', 'Remover volumes sem uso')
    await confirm(page, 'Remover sem uso')
    await expectToast(page, 'Volumes sem uso removidos.')
  })

  test.describe('motor nativo', () => {
    test.use({ engine: 'native' })

    test('o volume nativo é um VHDX com tamanho', async ({ page }) => {
      await goToVolumes(page)

      await expect(page.getByRole('columnheader', { name: 'Tamanho' })).toBeVisible()
      await expect(row(page, 'dados-nativos')).toContainText('1.07GB')
      await expect(row(page, 'dados-nativos')).toContainText('vhd')
    })

    test('não oferece labels (o SDK não guarda metadados)', async ({ page }) => {
      await goToVolumes(page)
      await page.getByRole('button', { name: 'Criar volume' }).click()
      await expect(modal(page).getByRole('textbox', { name: 'Labels' })).toHaveCount(0)
    })

    test('não oferece limpeza de volumes sem uso', async ({ page }) => {
      await goToVolumes(page)
      await page.getByRole('button', { name: 'Mais ações' }).click()

      await expect(page.getByRole('menuitem', { name: 'Remover volumes sem uso' })).toHaveCount(0)
    })

    test('explica que volumes "guest" não aparecem na lista', async ({ page }) => {
      await goToVolumes(page)
      await expect(page.getByText(/volume “guest”/)).toBeVisible()
    })

    test('o formulário exige tamanho válido e uid junto de gid', async ({ page }) => {
      await goToVolumes(page)
      await page.getByRole('button', { name: 'Criar volume' }).click()
      const dialog = modal(page)
      const criar = dialog.getByRole('button', { name: 'Criar volume' })

      await fillField(dialog, 'Nome do volume', 'e2e-invalido')
      await expect(criar).toBeEnabled()

      // O NumberInput recusa 0 sozinho (minValue), então o que ainda pode
      // deixar o formulário inválido é o campo vazio.
      await clearField(dialog, 'Tamanho')
      await expect(criar).toBeDisabled()

      await fillNumber(dialog, 'Tamanho', '512')
      await fillNumber(dialog, 'uid do dono', '1000')
      // uid sem gid não vale: os dois andam juntos.
      await expect(criar).toBeDisabled()

      await fillNumber(dialog, 'gid do dono', '1000')
      await expect(criar).toBeEnabled()
    })
  })
})

test.describe('Volumes · caminhos tristes', () => {
  test.describe('listagem indisponível', () => {
    test.use({ fail: ['volumes:list'] })

    test('mostra o erro na própria view', async ({ page }) => {
      await goToVolumes(page)
      await expectAlert(page, /Não foi possível listar os volumes/)
    })
  })

  test.describe('criação recusada', () => {
    test.use({ fail: ['volumes:create'] })

    test('avisa e mantém o diálogo aberto', async ({ page }) => {
      await goToVolumes(page)
      await page.getByRole('button', { name: 'Criar volume' }).click()
      await fillField(modal(page), 'Nome do volume', 'e2e-dados')
      await modal(page).getByRole('button', { name: 'Criar volume' }).click()

      await expectToast(page, /Falha ao criar o volume "e2e-dados"/)
      await expect(modal(page)).toBeVisible()
    })
  })

  test.describe('remoção recusada', () => {
    test.use({ fail: ['volumes:remove'] })

    test('o volume continua na lista', async ({ page }) => {
      await goToVolumes(page)
      await row(page, 'pgdata').getByRole('button', { name: 'Remover volume' }).click()
      await confirm(page, 'Remover')

      await expectToast(page, /Falha ao remover "pgdata"/)
      await expect(row(page, 'pgdata')).toBeVisible()
    })
  })

  test.describe('limpeza recusada', () => {
    test.use({ fail: ['volumes:prune'] })

    test('mostra o motivo da CLI', async ({ page }) => {
      await goToVolumes(page)
      await menuAction(page, 'Mais ações', 'Remover volumes sem uso')
      await confirm(page, 'Remover sem uso')

      await expectToast(page, /Falha ao remover os volumes sem uso/)
    })
  })
})
