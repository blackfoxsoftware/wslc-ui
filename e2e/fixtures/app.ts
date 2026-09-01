import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test'

/**
 * Fixture do app: uma instância do Electron POR TESTE, em modo demonstração.
 *
 * Cada instância recebe um `--user-data-dir` próprio, o que dá três coisas de
 * uma vez: estado limpo (settings, logs), o motor já escolhido no arquivo de
 * configuração antes do app subir, e liberdade para rodar testes em paralelo
 * — o lock de instância única do Electron é por pasta de dados.
 *
 * Nada aqui toca no WSL: `WSLC_UI_MOCK` troca o serviço da CLI, o motor
 * nativo, os streams e os efeitos externos pelos dublês (services/wslc/ops.ts).
 */

const ROOT = resolve(__dirname, '../..')
const ELECTRON = join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const MAIN = join(ROOT, 'out', 'main', 'index.js')

export type Engine = 'cli' | 'native'

/** Os dois motores, para as suítes que precisam cobrir os dois. */
export const ENGINES: Engine[] = ['cli', 'native']

export interface AppOptions {
  /** '1' = ambiente pronto; 'setup' = máquina sem o WSL/wslc. */
  mock: '1' | 'setup'
  /** Motor com que o app ABRE (gravado no settings.json). */
  engine: Engine
  /** Canais que devem falhar — ver WSLC_UI_MOCK_FAIL em mock-state.ts. */
  fail: string[]
  /** Caminho devolvido pelos diálogos de arquivo; 'cancel' simula cancelar. */
  pick: string | undefined
}

interface AppFixtures {
  app: ElectronApplication
  page: Page
}

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  return { ...env, ...extra }
}

export const test = base.extend<AppOptions & AppFixtures>({
  mock: ['1', { option: true }],
  engine: ['cli', { option: true }],
  fail: [[], { option: true }],
  pick: [undefined, { option: true }],

  app: async ({ mock, engine, fail, pick }, use) => {
    const userData = mkdtempSync(join(tmpdir(), 'wslc-ui-e2e-'))
    // O motor é lido do settings.json na primeira consulta: semear o arquivo
    // faz o app JÁ ABRIR no motor pedido, sem passar pela tela de Sistema.
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ engine }), 'utf8')

    const app = await electron.launch({
      executablePath: ELECTRON,
      args: [MAIN, `--user-data-dir=${userData}`],
      cwd: ROOT,
      env: cleanEnv({
        WSLC_UI_MOCK: mock,
        WSLC_UI_MOCK_FAIL: fail.join(','),
        WSLC_UI_MOCK_TICK_MS: '40',
        ...(pick === undefined ? {} : { WSLC_UI_MOCK_PICK: pick })
      })
    })

    await use(app)
    await app.close().catch(() => undefined)
  },

  page: async ({ app }, use, testInfo) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.setViewportSize({ width: 1280, height: 880 })
    // Pronto = ou o app inteiro (rail), ou o portão de instalação.
    await page
      .locator('nav[aria-label="Navegação principal"], h1:has-text("Ambiente ainda não está pronto")')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })

    await use(page)

    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('tela', { body: await page.screenshot(), contentType: 'image/png' })
    }
  }
})

export { expect } from '@playwright/test'
