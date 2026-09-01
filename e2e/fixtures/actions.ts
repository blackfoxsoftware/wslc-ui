import { expect, type Page } from '@playwright/test'
import { chooseOption, fillField, modal, toggleSwitch } from './ui'

/** Ações de domínio que mais de uma suíte precisa executar. */

export interface RunOptions {
  name: string
  /** Referência exata da imagem, ex.: /^alpine:latest$/. */
  image?: RegExp
  ports?: [string, string]
  /** Desligado cria o container já parado. */
  detach?: boolean
  command?: string
}

/** Sobe um container pelo diálogo "Executar container". */
export async function runContainer(page: Page, opts: RunOptions): Promise<void> {
  await page.getByRole('button', { name: 'Executar container' }).click()
  const dialog = modal(page)
  await expect(dialog).toBeVisible()

  if (opts.image) {
    await chooseOption(page, dialog.locator('[data-slot="select-trigger"]').first(), opts.image)
  }
  await fillField(dialog, 'Nome do container', opts.name)

  if (opts.ports) {
    await dialog.getByRole('tab', { name: 'Rede & Ambiente' }).click()
    await dialog.getByRole('button', { name: 'Adicionar porta' }).click()
    await fillField(dialog, 'Porta do host 1', opts.ports[0])
    await fillField(dialog, 'Porta do container 1', opts.ports[1])
  }

  if (opts.command) {
    await dialog.getByRole('tab', { name: 'Avançado' }).click()
    await fillField(dialog, 'Comando', opts.command)
  }

  if (opts.detach === false) {
    await dialog.getByRole('tab', { name: 'Geral' }).click()
    await toggleSwitch(dialog, 'Executar em segundo plano')
  }

  await dialog.getByRole('button', { name: /^(Executar|Baixar e executar)$/ }).click()
  await expect(dialog).toHaveCount(0)
}
