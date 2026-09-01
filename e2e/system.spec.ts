import { expect, test } from './fixtures/app'
import { confirm, expectToast, fillField, toggleSwitch } from './fixtures/ui'

/**
 * Sistema: ambiente, sessões do wslc, escolha do motor e tuning da sessão
 * nativa. É aqui que a troca CLI ↔ Nativo acontece de verdade.
 */

const goToSystem = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('link', { name: 'Sistema', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sistema' })).toBeVisible()
}

const engineToggle = (page: import('@playwright/test').Page, name: 'CLI' | 'Nativo') =>
  page.getByRole('button', { name, exact: true })

test.describe('Sistema · ambiente', () => {
  test.beforeEach(async ({ page }) => {
    await goToSystem(page)
  })

  test('mostra a versão do WSL, do wslc e o estado do ambiente', async ({ page }) => {
    await expect(page.getByText('2.9.3.0')).toBeVisible()
    await expect(page.getByText('mock', { exact: true })).toBeVisible()
    await expect(page.getByText('pronto', { exact: true })).toBeVisible()
  })

  test('lista as sessões wslc ativas e atualiza sob demanda', async ({ page }) => {
    await expect(page.getByRole('grid', { name: 'Sessões wslc' })).toContainText('wslc-cli-mock')

    await page.getByRole('button', { name: 'Atualizar sessões' }).click()
    await expect(page.getByRole('grid', { name: 'Sessões wslc' })).toContainText('wslc-cli-mock')
  })

  test('abrir o settings.yaml do wslc é um efeito externo registrado', async ({ page }) => {
    await page.getByRole('button', { name: 'Abrir settings.yaml do wslc' }).click()

    await page.getByRole('button', { name: 'Expandir logs' }).click()
    await expect(page.getByText(/\(demo\) settings.yaml do wslc aberto/)).toBeVisible()
  })

  test('redefine as configurações do wslc depois de confirmar', async ({ page }) => {
    await page.getByRole('button', { name: 'Redefinir configurações do wslc' }).click()
    await confirm(page, 'Redefinir')

    await expectToast(page, 'Configurações redefinidas para os padrões.')
  })

  test('encerra a sessão do WSL container depois de confirmar', async ({ page }) => {
    await page.getByRole('button', { name: /Encerrar a sessão do WSL container/ }).click()
    await confirm(page, 'Encerrar sessão')

    await expectToast(page, 'Sessão encerrada.')
  })

  test('reverifica o ambiente', async ({ page }) => {
    await page.getByRole('button', { name: 'Reverificar ambiente' }).click()
    await expect(page.getByText('pronto', { exact: true })).toBeVisible()
  })

  test('links de referência abrem no navegador, não numa janela do app', async ({ page }) => {
    await page.getByRole('link', { name: /Documentação do WSL container/ }).click()

    await page.getByRole('button', { name: 'Expandir logs' }).click()
    await expect(
      page.getByText(/\(demo\) link aberto no navegador: https:\/\/learn.microsoft.com/)
    ).toBeVisible()
  })
})

test.describe('Sistema · motor de execução', () => {
  test('mostra o SDK nativo disponível', async ({ page }) => {
    await goToSystem(page)

    await expect(page.getByText('disponível', { exact: true })).toBeVisible()
    await expect(page.getByText('0.9.0')).toBeVisible()
    await expect(page.getByText(/wslcsdk\.dll/)).toBeVisible()
  })

  test('troca da CLI para o nativo e volta', async ({ page }) => {
    await goToSystem(page)
    await expect(engineToggle(page, 'CLI')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('inativa')).toBeVisible()

    await engineToggle(page, 'Nativo').click()
    await expectToast(page, 'Motor alterado para Nativo (wslcsdk).')
    await expect(engineToggle(page, 'Nativo')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('"WslcUi" ativa', { exact: true })).toBeVisible()

    await engineToggle(page, 'CLI').click()
    await expectToast(page, 'Motor alterado para CLI (wslc.exe).')
    await expect(engineToggle(page, 'CLI')).toHaveAttribute('aria-pressed', 'true')
  })

  test('o motor escolhido vale para as outras views', async ({ page }) => {
    await goToSystem(page)
    await engineToggle(page, 'Nativo').click()
    await expectToast(page, /Motor alterado/)

    await page.getByRole('link', { name: 'Containers', exact: true }).click()
    await expect(page.getByText('motor nativo')).toBeVisible()
    await expect(page.getByText('Sem containers')).toBeVisible()
  })

  test.describe('motor salvo no settings.json', () => {
    test.use({ engine: 'native' })

    test('o app reabre direto no motor nativo', async ({ page }) => {
      await goToSystem(page)
      await expect(engineToggle(page, 'Nativo')).toHaveAttribute('aria-pressed', 'true')
    })
  })
})

test.describe('Sistema · tuning da sessão nativa', () => {
  test('salva o tuning no motor CLI sem reiniciar nada', async ({ page }) => {
    await goToSystem(page)

    await fillField(page, 'CPUs', '2')
    await fillField(page, 'Memória', '2048')
    await fillField(page, 'VHD do storage', '10240')
    await toggleSwitch(page, 'GPU na sessão')
    await page.getByRole('button', { name: 'Salvar tuning' }).click()

    await expectToast(page, 'Tuning salvo: vale quando a sessão nativa for criada.')
  })

  test('o tuning salvo é lido de volta', async ({ page }) => {
    await goToSystem(page)
    await fillField(page, 'CPUs', '4')
    await page.getByRole('button', { name: 'Salvar tuning' }).click()
    await expectToast(page, /Tuning salvo/)

    // Sai da view e volta: o valor vem do settings.json, não do estado local.
    await page.getByRole('link', { name: 'Containers', exact: true }).click()
    await goToSystem(page)
    await expect(page.getByRole('textbox', { name: 'CPUs' })).toHaveValue('4')
  })

  test.describe('no motor nativo', () => {
    test.use({ engine: 'native' })

    test('salvar o tuning exige reiniciar a sessão', async ({ page }) => {
      await goToSystem(page)
      await fillField(page, 'CPUs', '2')
      await page.getByRole('button', { name: 'Salvar tuning' }).click()

      await confirm(page, 'Salvar e reiniciar')
      await expectToast(page, /Sessão nativa reiniciada/)
    })

    test('recusar o reinício não salva nada', async ({ page }) => {
      await goToSystem(page)
      await fillField(page, 'CPUs', '2')
      await page.getByRole('button', { name: 'Salvar tuning' }).click()

      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(page.locator('[data-slot="toast"]')).toHaveCount(0)
    })

    test('reseta a sessão nativa depois de confirmar', async ({ page }) => {
      await goToSystem(page)
      await page.getByRole('button', { name: 'Resetar sessão nativa' }).click()
      await confirm(page, 'Resetar sessão nativa')

      await expectToast(page, /Sessão nativa resetada/)
    })
  })
})

test.describe('Sistema · caminhos tristes', () => {
  test.describe('SDK nativo indisponível', () => {
    test.use({ fail: ['native:status'] })

    test('o motor nativo não pode ser escolhido', async ({ page }) => {
      await goToSystem(page)

      await expect(page.getByText('indisponível').first()).toBeVisible()
      await expect(engineToggle(page, 'Nativo')).toBeDisabled()
      await expect(page.getByText(/wslcsdk.dll não encontrada/)).toBeVisible()
      // Sem SDK também não há tuning nem reset.
      await expect(page.getByRole('button', { name: 'Salvar tuning' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Resetar sessão nativa' })).toBeDisabled()
    })
  })

  test.describe('sessão nativa ocupada por outro processo', () => {
    test.use({ fail: ['engine:native'] })

    test('a troca de motor falha e o app permanece na CLI', async ({ page }) => {
      await goToSystem(page)
      await engineToggle(page, 'Nativo').click()

      await expectToast(page, /já está aberta por outro processo/)
      await expect(engineToggle(page, 'CLI')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  test.describe('reinício da sessão recusado', () => {
    test.use({ engine: 'native', fail: ['system:restart-native'] })

    test('avisa que o reinício falhou', async ({ page }) => {
      await goToSystem(page)
      await fillField(page, 'CPUs', '2')
      await page.getByRole('button', { name: 'Salvar tuning' }).click()
      await confirm(page, 'Salvar e reiniciar')

      await expectToast(page, /Falha ao reiniciar a sessão nativa/)
    })
  })

  test.describe('reset da sessão recusado', () => {
    test.use({ engine: 'native', fail: ['system:reset-native'] })

    test('avisa que o reset falhou', async ({ page }) => {
      await goToSystem(page)
      await page.getByRole('button', { name: 'Resetar sessão nativa' }).click()
      await confirm(page, 'Resetar sessão nativa')

      await expectToast(page, /Falha ao resetar a sessão nativa/)
    })
  })

  test.describe('encerramento da sessão recusado', () => {
    test.use({ fail: ['system:terminate-session'] })

    test('avisa o motivo', async ({ page }) => {
      await goToSystem(page)
      await page.getByRole('button', { name: /Encerrar a sessão do WSL container/ }).click()
      await confirm(page, 'Encerrar sessão')

      await expectToast(page, /Falha ao encerrar a sessão/)
    })
  })

  test.describe('redefinição das configurações recusada', () => {
    test.use({ fail: ['system:reset-wslc-settings'] })

    test('avisa o motivo', async ({ page }) => {
      await goToSystem(page)
      await page.getByRole('button', { name: 'Redefinir configurações do wslc' }).click()
      await confirm(page, 'Redefinir')

      await expectToast(page, /Falha ao redefinir as configurações/)
    })
  })

  test.describe('sessões indisponíveis', () => {
    test.use({ fail: ['system:sessions'] })

    test('a lista de sessões fica vazia sem derrubar a view', async ({ page }) => {
      await goToSystem(page)

      await expect(page.getByText('Sem sessões ativas')).toBeVisible()
      await expect(page.getByText('2.9.3.0')).toBeVisible()
    })
  })
})
