import { ENGINES, expect, test } from './fixtures/app'
import { runContainer } from './fixtures/actions'
import {
  cancelConfirm,
  closeSheet,
  closeStream,
  confirm,
  expectAlert,
  expectToast,
  fillField,
  menuAction,
  modal,
  row,
  sheet
} from './fixtures/ui'

/**
 * Containers, nos DOIS motores.
 *
 * O motor CLI já vem com dois containers de demonstração; o nativo abre com a
 * sessão vazia, então a suíte semeia os mesmos dois antes de cada teste. A
 * partir daí os dois motores respondem às mesmas ações — e as diferenças
 * reais (stats, export, terminal externo) ganham teste próprio no fim.
 */

for (const engine of ENGINES) {
  test.describe(`Containers · motor ${engine}`, () => {
    test.use({ engine })

    // A sessão nativa nasce vazia: semeia os mesmos dois containers do demo
    // da CLI para o resto da suíte valer para os dois motores.
    test.beforeEach(async ({ page }) => {
      if (engine !== 'native') return
      await expect(page.getByText('Sem containers')).toBeVisible()
      await runContainer(page, { name: 'web', image: /^nginx:latest$/, ports: ['8080', '80'] })
      await runContainer(page, { name: 'db', image: /^alpine:latest$/, detach: false })
    })

    test('lista os containers com nome, imagem e estado', async ({ page }) => {
      await expect(row(page, 'web')).toContainText('nginx:latest')
      await expect(row(page, 'web')).toContainText('8080')
      await expect(row(page, 'db')).toBeVisible()
      await expect(page.getByText(/\d+ containers \(incluindo parados\)/)).toBeVisible()
    })

    test('executa um container novo com porta publicada', async ({ page }) => {
      await runContainer(page, { name: 'e2e-novo', image: /^alpine:latest$/, ports: ['9090', '8080'] })

      await expectToast(page, 'Container "e2e-novo" iniciado')
      await expect(row(page, 'e2e-novo')).toContainText('alpine:latest')
      await expect(row(page, 'e2e-novo')).toContainText('0.0.0.0:9090->8080/tcp')
    })

    test('para e inicia de novo', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Parar' }).click()
      await expectToast(page, 'Container "web" parado.')
      await expect(row(page, 'web').getByRole('button', { name: 'Iniciar' })).toBeVisible()

      await row(page, 'web').getByRole('button', { name: 'Iniciar' }).click()
      await expectToast(page, 'Container "web" iniciado.')
      await expect(row(page, 'web').getByRole('button', { name: 'Parar' })).toBeVisible()
    })

    test('reinicia pelo menu da linha', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Reiniciar', row(page, 'web'))
      await expectToast(page, 'Container "web" reiniciado.')
    })

    test('força o encerramento com SIGKILL depois de confirmar', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Forçar encerramento', row(page, 'web'))
      await confirm(page, 'Forçar encerramento')

      await expectToast(page, 'Container "web" encerrado (SIGKILL).')
      await expect(row(page, 'web')).toContainText('137')
    })

    test('remover pede confirmação e cancelar não remove nada', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Remover', row(page, 'db'))
      await cancelConfirm(page)
      await expect(row(page, 'db')).toBeVisible()

      await menuAction(page, 'Mais ações do container', 'Remover', row(page, 'db'))
      await confirm(page, 'Remover')
      await expectToast(page, 'Container "db" removido.')
      await expect(page.getByRole('row').filter({ hasText: 'db' })).toHaveCount(0)
    })

    test('"Mostrar parados" filtra a lista', async ({ page }) => {
      await expect(row(page, 'db')).toBeVisible()

      await page.getByRole('button', { name: 'Mostrar parados' }).click()
      await expect(page.getByRole('row').filter({ hasText: 'db' })).toHaveCount(0)
      await expect(row(page, 'web')).toBeVisible()
      await expect(page.getByText(/\d+ container(es)? em execução/)).toBeVisible()

      await page.getByRole('button', { name: 'Mostrar parados' }).click()
      await expect(row(page, 'db')).toBeVisible()
    })

    test('remove os containers parados', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Remover containers parados')
      await confirm(page, 'Remover parados')

      await expectToast(page, 'Containers parados removidos.')
      await expect(page.getByRole('row').filter({ hasText: 'db' })).toHaveCount(0)
      await expect(row(page, 'web')).toBeVisible()
    })

    test('remove todos os containers e mostra o estado vazio', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Remover todos os containers')
      await confirm(page, 'Remover tudo')

      await expectToast(page, /container\(s\) removido\(s\)/)
      await expect(page.getByText('Sem containers')).toBeVisible()
    })

    test('detalhes trazem o inspect e executam um comando', async ({ page }) => {
      await row(page, 'web').getByTitle('Ver detalhes').click()
      await expect(sheet(page)).toBeVisible()
      await expect(sheet(page).getByText('"Running": true')).toBeVisible()

      await fillField(sheet(page), 'Comando a executar', 'uname -a')
      await sheet(page).getByRole('button', { name: 'Exec', exact: true }).click()
      await expect(sheet(page).getByText(/Linux mock-container/)).toBeVisible()

      await closeSheet(page)
    })

    test('logs abrem o painel de saída e podem ser parados', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Logs' }).click()

      await expect(page.getByText(/Logs de web/)).toBeVisible()
      await expect(page.getByText('pronto para receber conexões')).toBeVisible()
      // logs --follow segue vivo até o usuário parar.
      await expect(page.getByRole('button', { name: 'Parar e fechar' })).toBeVisible()

      await closeStream(page)
      await expect(page.getByText('pronto para receber conexões')).toHaveCount(0)
    })
  })
}

test.describe('Containers · diferenças entre os motores', () => {
  test.describe('motor CLI', () => {
    test('mostra métricas de CPU e memória por container', async ({ page }) => {
      await expect(row(page, 'web').getByLabel('CPU de web')).toBeVisible()
    })

    test('oferece terminal externo e exportação do filesystem', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Mais ações do container' }).click()
      await expect(page.getByRole('menuitem', { name: 'Terminal externo' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Exportar filesystem' })).toBeVisible()
    })

    test('exportar filesystem só é possível com o container parado', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Mais ações do container' }).click()
      await expect(page.getByRole('menuitem', { name: 'Exportar filesystem' })).toBeDisabled()
      await page.keyboard.press('Escape')

      await row(page, 'db').getByRole('button', { name: 'Mais ações do container' }).click()
      await expect(page.getByRole('menuitem', { name: 'Exportar filesystem' })).toBeEnabled()
    })

    test('exporta o filesystem de um container parado', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Exportar filesystem', row(page, 'db'))
      await expectToast(page, /Filesystem de "db" exportado para/)
    })

    test('terminal externo em modo demo só registra a intenção', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Terminal externo', row(page, 'web'))
      await page.getByRole('button', { name: 'Expandir logs' }).click()
      await expect(page.getByText(/\(demo\) terminal externo pedido para/)).toBeVisible()
    })
  })

  test.describe('motor nativo', () => {
    test.use({ engine: 'native' })

    test('avisa que os containers pertencem à sessão nativa', async ({ page }) => {
      await expect(page.getByText('motor nativo')).toBeVisible()
    })

    test('não expõe stats, terminal externo nem exportação', async ({ page }) => {
      await runContainer(page, { name: 'web', image: /^nginx:latest$/ })

      // O SDK preview não expõe stats: a coluna fica vazia.
      await expect(row(page, 'web').getByLabel('CPU de web')).toHaveCount(0)

      await row(page, 'web').getByRole('button', { name: 'Mais ações do container' }).click()
      await expect(page.getByRole('menuitem', { name: 'Terminal externo' })).toHaveCount(0)
      await expect(page.getByRole('menuitem', { name: 'Exportar filesystem' })).toHaveCount(0)
    })

    test('a lista do motor nativo é outra sessão, não a da CLI', async ({ page }) => {
      // Os containers de demonstração da CLI (web, db) não existem aqui.
      await expect(page.getByText('Sem containers')).toBeVisible()
    })
  })
})

test.describe('Containers · caminhos tristes', () => {
  test.describe('listagem indisponível', () => {
    test.use({ fail: ['containers:list'] })

    test('mostra o erro na própria view', async ({ page }) => {
      await expectAlert(page, /Não foi possível listar os containers/)
    })
  })

  test.describe('ação recusada', () => {
    test.use({ fail: ['containers:action'] })

    test('parar falha e o container continua rodando', async ({ page }) => {
      await row(page, 'web').getByRole('button', { name: 'Parar' }).click()

      await expectToast(page, /Falha ao stop/)
      await expect(row(page, 'web').getByRole('button', { name: 'Parar' })).toBeVisible()
    })
  })

  test.describe('criação recusada', () => {
    test.use({ fail: ['containers:run'] })

    test('o erro aparece dentro do diálogo, que continua aberto', async ({ page }) => {
      await page.getByRole('button', { name: 'Executar container' }).click()
      const dialog = modal(page)
      await fillField(dialog, 'Nome do container', 'nao-vai')
      await dialog.getByRole('button', { name: /^(Executar|Baixar e executar)$/ }).click()

      await expect(dialog.getByText(/Falha ao criar o container/)).toBeVisible()
      await expect(dialog).toBeVisible()
    })
  })

  test.describe('encerramento recusado', () => {
    test.use({ fail: ['containers:kill'] })

    test('SIGKILL que falha avisa o motivo', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Forçar encerramento', row(page, 'web'))
      await confirm(page, 'Forçar encerramento')

      await expectToast(page, /Falha ao encerrar o container/)
    })
  })

  test.describe('exportação cancelada no diálogo de arquivo', () => {
    test.use({ pick: 'cancel' })

    test('cancelar o diálogo não exporta nem avisa nada', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Exportar filesystem', row(page, 'db'))

      await expect(page.locator('[data-slot="toast"]')).toHaveCount(0)
    })
  })

  test.describe('exportação recusada pela CLI', () => {
    test.use({ fail: ['containers:export'] })

    test('mostra o erro da CLI', async ({ page }) => {
      await menuAction(page, 'Mais ações do container', 'Exportar filesystem', row(page, 'db'))
      await expectToast(page, /Falha ao exportar/)
    })
  })
})
