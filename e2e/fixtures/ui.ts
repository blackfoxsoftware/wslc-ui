import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Vocabulário da UI para os testes.
 *
 * Os seletores saem do que o app já expõe para quem usa leitor de tela
 * (papel + nome acessível) e, para os overlays do HeroUI, do `data-slot` que
 * a biblioteca marca em cada peça. Nada de classe de Tailwind: elas mudam
 * quando o visual muda, e o teste não é sobre visual.
 */

export type ViewName = 'Containers' | 'Imagens' | 'Volumes' | 'Redes' | 'Sistema'

/** Vai para uma view pelo menu lateral e espera o título trocar. */
export async function goto(page: Page, view: ViewName): Promise<void> {
  await page.getByRole('link', { name: view, exact: true }).click()
  await expect(page.getByRole('heading', { name: view, exact: true, level: 1 })).toBeVisible()
}

// ————————————————————————————————————————————————————— avisos

/** Todos os toasts na tela (o conteúdo é o texto da mensagem). */
export const toasts = (page: Page): Locator => page.locator('[data-slot="toast"]')

/** Espera um toast com este texto. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(toasts(page).filter({ hasText: text }).first()).toBeVisible()
}

/** Alerta inline da view (ErrorAlert / Notice). */
export const alerts = (page: Page): Locator => page.locator('.alert')

export async function expectAlert(page: Page, text: string | RegExp): Promise<void> {
  await expect(alerts(page).filter({ hasText: text }).first()).toBeVisible()
}

// ————————————————————————————————————————————————————— overlays

export const modal = (page: Page): Locator => page.locator('[data-slot="modal-dialog"]')
export const sheet = (page: Page): Locator => page.locator('[data-slot="drawer-dialog"]')
export const confirmBox = (page: Page): Locator => page.locator('[data-slot="alert-dialog-dialog"]')

/** Confirma o diálogo destrutivo pelo rótulo do botão de ação. */
export async function confirm(page: Page, label: string): Promise<void> {
  const box = confirmBox(page)
  await expect(box).toBeVisible()
  await box.getByRole('button', { name: label, exact: true }).click()
  await expect(box).toHaveCount(0)
}

/** Recusa o diálogo destrutivo. */
export async function cancelConfirm(page: Page): Promise<void> {
  const box = confirmBox(page)
  await expect(box).toBeVisible()
  await box.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(box).toHaveCount(0)
}

export async function closeSheet(page: Page): Promise<void> {
  await page.locator('[data-slot="drawer-close-trigger"]').first().click()
  await expect(sheet(page)).toHaveCount(0)
}

// ————————————————————————————————————————————————————— controles

/** Abre um menu "⋮" pelo nome do gatilho e aciona um item. */
export async function menuAction(
  page: Page,
  trigger: string,
  item: string | RegExp,
  scope?: Locator
): Promise<void> {
  const button = (scope ?? page).getByRole('button', { name: trigger, exact: true }).first()
  await button.click()
  await page.getByRole('menuitem', { name: item }).first().click()
}

/** Escolhe uma opção num Select do design system. */
export async function chooseOption(page: Page, trigger: Locator, option: string | RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole('option', { name: option }).first().click()
}

/**
 * Liga/desliga um Switch pelo rótulo.
 *
 * O controle acessível é um input escondido dentro do <label>: clicar nele
 * direto esbarra na moldura da linha. Quem recebe o clique é o rótulo.
 */
export async function toggleSwitch(scope: Page | Locator, label: string): Promise<void> {
  await scope.getByText(label, { exact: true }).click()
}

/** Preenche um campo de texto pelo rótulo. */
export async function fillField(scope: Page | Locator, label: string, value: string): Promise<void> {
  await scope.getByRole('textbox', { name: label, exact: true }).fill(value)
}

// ————————————————————————————————————————————————————— listas

/** Linha de uma tabela que contenha este texto. */
export function row(page: Page, text: string | RegExp): Locator {
  return page.getByRole('row').filter({ hasText: text }).first()
}

/** A tabela com este nome acessível. */
export function grid(page: Page, name: string): Locator {
  return page.getByRole('grid', { name })
}

// ————————————————————————————————————————————————————— painéis

/** Painel de saída em streaming (pull, push, build, logs). */
export const streamPanel = (page: Page): Locator =>
  page
    .locator('section')
    .filter({ has: page.locator('pre') })
    .last()

/** Espera o stream terminar com o código dado e fecha o painel. */
export async function expectStreamFinished(page: Page, code = 0): Promise<void> {
  await expect(page.getByText(`finalizado (código ${code})`)).toBeVisible({ timeout: 20_000 })
}

export async function closeStream(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^(Fechar|Parar e fechar)$/ })
    .last()
    .click()
}

/** Abre o painel de logs do app. */
export async function openLogsPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Expandir logs' }).click()
  await expect(page.getByRole('searchbox', { name: 'Filtrar mensagens' })).toBeVisible()
}
