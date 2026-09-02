import { expect, test } from './fixtures/app'
import { expectToast, goto } from './fixtures/ui'

/**
 * Auto-updater na aba Sistema.
 *
 * O ciclo real (achar, baixar, instalar) só aconteceria com uma release
 * publicada e um app instalado — tarde demais para descobrir que a tela está
 * errada. Aqui ele roda contra o updater de demonstração, que percorre os
 * mesmos estados em milissegundos e nos três modos.
 */

const chip = (page: import('@playwright/test').Page, texto: string) => page.getByText(texto, { exact: true })

const procurar = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Procurar atualizações' })

test.describe('Atualizações · com instalador', () => {
  test('encontra, baixa e fica pronta para instalar ao fechar', async ({ page }) => {
    await goto(page, 'Sistema')
    await expect(chip(page, 'não verificado')).toBeVisible()

    await procurar(page).click()

    await expect(chip(page, 'pronta para instalar')).toBeVisible()
    await expectToast(page, /Versão \d+\.\d+\.\d+ pronta/)
    await expect(page.getByRole('button', { name: 'Reiniciar e instalar agora' })).toBeVisible()
  })

  test('mostra as notas da versão nova', async ({ page }) => {
    await goto(page, 'Sistema')
    await procurar(page).click()

    await expect(page.getByText('Atualização automática a partir das releases do GitHub')).toBeVisible()
  })

  test('instalar encerra o app pelo caminho ordenado', async ({ page }) => {
    await goto(page, 'Sistema')
    await procurar(page).click()
    await page.getByRole('button', { name: 'Reiniciar e instalar agora' }).click()

    await page.getByRole('button', { name: 'Expandir logs' }).click()
    await expect(page.getByText(/\(demo\) app fechado para instalar a versão/)).toBeVisible()
  })
})

test.describe('Atualizações · caminho triste', () => {
  test.describe('checagem falha', () => {
    test.use({ fail: ['updates:check'] })

    test('o erro aparece na própria seção', async ({ page }) => {
      await goto(page, 'Sistema')
      await procurar(page).click()

      await expect(chip(page, 'falhou')).toBeVisible()
      await expect(page.getByText(/GitHub respondeu 503/)).toBeVisible()
    })
  })

  test.describe('download falha', () => {
    test.use({ fail: ['updates:download'] })

    // A versão encontrada continua à vista: é o que permite oferecer o caminho
    // manual quando o automático não deu certo.
    test('mantém a versão encontrada mesmo tendo falhado', async ({ page }) => {
      await goto(page, 'Sistema')
      await procurar(page).click()

      await expect(chip(page, 'falhou')).toBeVisible()
      await expect(page.getByText(/conexão perdida durante o download/)).toBeVisible()
      await expect(page.getByText(/^\d+\.\d+\.\d+$/).nth(1)).toBeVisible()
    })
  })
})

test.describe('Atualizações · portátil', () => {
  test.use({ update: 'portable' })

  test('avisa e leva para a release, sem instalar nada', async ({ page }) => {
    await goto(page, 'Sistema')
    await procurar(page).click()

    await expect(chip(page, 'versão nova')).toBeVisible()
    await expectToast(page, /Versão \d+\.\d+\.\d+ disponível/)
    await expect(page.getByRole('button', { name: 'Baixar na release' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reiniciar e instalar agora' })).toHaveCount(0)
  })

  test('o link da release é um efeito externo registrado', async ({ page }) => {
    await goto(page, 'Sistema')
    await procurar(page).click()
    await page.getByRole('button', { name: 'Baixar na release' }).click()

    await page.getByRole('button', { name: 'Expandir logs' }).click()
    await expect(page.getByText(/\(demo\) link aberto no navegador:.*releases\/tag/)).toBeVisible()
  })
})

test.describe('Atualizações · rodando do código-fonte', () => {
  test.use({ update: 'disabled' })

  test('não oferece o que não pode cumprir', async ({ page }) => {
    await goto(page, 'Sistema')

    await expect(procurar(page)).toBeDisabled()
    await expect(page.getByText(/não há instalação para atualizar por cima/)).toBeVisible()
  })
})
