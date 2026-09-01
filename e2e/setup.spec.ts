import { expect, test } from './fixtures/app'
import { expectToast } from './fixtures/ui'

/**
 * Portão de instalação: a máquina não tem o WSL/wslc na versão exigida.
 * O app não deixa entrar e oferece a instalação guiada pelo SDK nativo.
 */

test.use({ mock: 'setup' })

test.describe('Ambiente incompleto', () => {
  test('mostra o checklist com o que falta e não deixa entrar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Ambiente ainda não está pronto' })).toBeVisible()

    // WSL está instalado, mas a versão não serve e o wslc não existe.
    await expect(page.locator('li[data-state="ok"]')).toHaveCount(1)
    await expect(page.locator('li[data-state="fail"]')).toHaveCount(2)
    await expect(page.getByText('2.7.12.0').first()).toBeVisible()

    // Sem ambiente não há app: o menu lateral nem existe.
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0)
  })

  test('oferece a alternativa manual pelo PowerShell', async ({ page }) => {
    await expect(page.getByText('wsl --update --pre-release')).toBeVisible()
  })

  test('"Verificar novamente" mantém a tela enquanto nada mudou', async ({ page }) => {
    await page.getByRole('button', { name: 'Verificar novamente' }).click()
    await expect(page.getByRole('heading', { name: 'Ambiente ainda não está pronto' })).toBeVisible()
  })

  test('instalação guiada conclui e o app entra', async ({ page }) => {
    await page.getByRole('button', { name: 'Instalar componentes automaticamente' }).click()

    await expectToast(page, 'Instalação concluída')
    // O ambiente passou a responder que está pronto → a casca completa monta.
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible()
  })
})

test.describe('Instalação guiada que falha', () => {
  test.use({ fail: ['system:install-wslc'] })

  test('explica o motivo e mantém o portão fechado', async ({ page }) => {
    await page.getByRole('button', { name: 'Instalar componentes automaticamente' }).click()

    await expectToast(page, /privilégios de administrador/)
    await expect(page.getByRole('heading', { name: 'Ambiente ainda não está pronto' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0)
  })
})

test.describe('Ambiente incompleto sem o SDK', () => {
  test.use({ fail: ['native:status'] })

  test('sem a DLL não há instalação guiada, só o caminho manual', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Ambiente ainda não está pronto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Instalar componentes automaticamente' })).toHaveCount(0)
    await expect(page.getByText('Para instalar, abra o PowerShell e execute:')).toBeVisible()
  })
})
