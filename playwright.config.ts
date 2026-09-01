import { defineConfig } from '@playwright/test'

/**
 * E2E do app inteiro, contra o Electron compilado (`out/`), em modo demo.
 *
 * Não há navegador envolvido: `_electron.launch` sobe o app de verdade, com
 * o processo main, o preload e a validação Zod do contrato IPC no caminho.
 * Cada teste sobe a sua própria instância (ver e2e/fixtures/app.ts), então
 * eles são independentes e podem correr em paralelo.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : 4,
  retries: process.env['CI'] ? 1 : 0,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']]
})
