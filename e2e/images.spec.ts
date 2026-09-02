import { ENGINES, expect, test } from './fixtures/app'
import {
  chooseOption,
  closeSheet,
  closeStream,
  confirm,
  expectAlert,
  expectStreamFinished,
  expectToast,
  fillField,
  fillTags,
  menuAction,
  modal,
  row,
  sheet,
  toasts,
  toggleSwitch
} from './fixtures/ui'

/**
 * Imagens, nos dois motores: pull/push com progresso, tarballs, tags,
 * registry e catálogo. Build, inspect, save e prune só existem na CLI — as
 * ausências no motor nativo também são testadas.
 */

const goToImages = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('link', { name: 'Imagens', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Imagens' })).toBeVisible()
}

for (const engine of ENGINES) {
  test.describe(`Imagens · motor ${engine}`, () => {
    test.use({ engine })

    test.beforeEach(async ({ page }) => {
      await goToImages(page)
    })

    test('lista as imagens locais e conta na aba', async ({ page }) => {
      await expect(row(page, 'nginx')).toBeVisible()
      await expect(row(page, 'alpine')).toBeVisible()
      await expect(page.getByRole('tab', { name: /Locais/ })).toContainText(/[1-9]/)
      await expect(page.getByText(/\d+ imagens locais/)).toBeVisible()
    })

    test('baixa uma imagem pelo campo do cabeçalho', async ({ page }) => {
      await fillField(page, 'Imagem para baixar', 'redis:7')
      await page.getByRole('button', { name: 'Baixar imagem (pull)' }).click()

      await expect(page.getByText(/Pull de redis:7/).first()).toBeVisible()
      await expectStreamFinished(page, 0)
      await closeStream(page)

      await page.getByRole('button', { name: 'Atualizar' }).click()
      await expect(row(page, 'redis')).toBeVisible()
    })

    test('cria uma tag nova para uma imagem', async ({ page }) => {
      await menuAction(page, 'Ações da imagem', 'Nova tag', row(page, 'alpine'))
      await fillField(modal(page), 'Nova referência', 'meu-registry.io/alpine:v1')
      await modal(page).getByRole('button', { name: 'Criar tag' }).click()

      await expectToast(page, /marcada como "meu-registry.io\/alpine:v1"/)
      await expect(row(page, 'meu-registry.io/alpine')).toBeVisible()
    })

    test('envia uma imagem para o registry', async ({ page }) => {
      await menuAction(page, 'Ações da imagem', 'Push para registry', row(page, 'nginx'))

      await expect(page.getByText(/Push de nginx:latest/).first()).toBeVisible()
      await expectStreamFinished(page, 0)
      await closeStream(page)
    })

    test('remove uma imagem depois de confirmar', async ({ page }) => {
      await menuAction(page, 'Ações da imagem', 'Remover', row(page, 'alpine'))
      await confirm(page, 'Remover')

      await expectToast(page, /Imagem "alpine:latest" removida/)
      await expect(page.getByRole('row').filter({ hasText: 'alpine' })).toHaveCount(0)
    })

    test('remove todas as imagens e mostra o estado vazio', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Remover todas as imagens')
      await confirm(page, 'Remover tudo')

      await expectToast(page, /imagem\(ns\) removida\(s\)/)
      await expect(page.getByText('Nenhuma imagem local')).toBeVisible()
    })

    test('faz login e logout em registry', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Login em registry')
      await fillField(modal(page), 'Servidor', 'registry.exemplo.com')
      await fillField(modal(page), 'Usuário', 'rafael')
      await fillField(modal(page), 'Senha ou token', 'segredo')
      await modal(page).getByRole('button', { name: 'Entrar' }).click()

      await expectToast(page, /Login em registry.exemplo.com OK/)

      await menuAction(page, 'Mais ações', 'Logout de registry')
      await fillField(modal(page), 'Registry', 'registry.exemplo.com')
      await modal(page).getByRole('button', { name: 'Fazer logout' }).click()

      await expectToast(page, /registry.exemplo.com/)
    })

    test('carrega uma imagem salva em tarball', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Carregar imagem salva')

      await expect(page.getByText(/Load de imagem.tar/).first()).toBeVisible()
      await expectStreamFinished(page, 0)
      await closeStream(page)

      await page.getByRole('button', { name: 'Atualizar' }).click()
      await expect(row(page, 'demo-carregada')).toBeVisible()
    })

    test('importa um rootfs como imagem nova', async ({ page }) => {
      await menuAction(page, 'Mais ações', 'Importar rootfs')
      const dialog = modal(page)

      // Sem arquivo escolhido o botão fica travado.
      await expect(dialog.getByRole('button', { name: 'Importar' })).toBeDisabled()
      await dialog.getByRole('button', { name: 'Escolher…' }).click()
      await expect(dialog.getByText('imagem.tar')).toBeVisible()

      await fillField(dialog, 'Nome da imagem', 'minha-base:v1')
      await dialog.getByRole('button', { name: 'Importar' }).click()

      await expect(page.getByText(/Import de minha-base:v1/).first()).toBeVisible()
      await expectStreamFinished(page, 0)
      await closeStream(page)

      await page.getByRole('button', { name: 'Atualizar' }).click()
      await expect(row(page, 'minha-base')).toBeVisible()
    })

    test('catálogo filtra por texto e por categoria', async ({ page }) => {
      await page.getByRole('tab', { name: 'Catálogo' }).click()

      await chooseOption(page, page.locator('[data-slot="select-trigger"]').first(), 'Bancos de dados')
      await expect(row(page, 'postgres')).toBeVisible()
      await expect(page.getByRole('row').filter({ hasText: 'hello-world' })).toHaveCount(0)

      await chooseOption(page, page.locator('[data-slot="select-trigger"]').first(), 'Todas as categorias')
      await page.getByRole('searchbox', { name: 'Filtrar catálogo' }).fill('hello')
      await expect(row(page, 'hello-world')).toBeVisible()
    })

    test('catálogo marca o que já está baixado e permite baixar', async ({ page }) => {
      await page.getByRole('tab', { name: 'Catálogo' }).click()
      await page.getByRole('searchbox', { name: 'Filtrar catálogo' }).fill('nginx')

      await expect(row(page, 'nginx').getByText('baixada')).toBeVisible()
      await expect(row(page, 'nginx').getByRole('button', { name: 'Atualizar' })).toBeVisible()

      await page.getByRole('searchbox', { name: 'Filtrar catálogo' }).fill('redis')
      await row(page, 'redis:').getByRole('button', { name: 'Pull' }).click()
      await expectStreamFinished(page, 0)
    })

    test('busca no Docker Hub aparece junto com o catálogo', async ({ page }) => {
      await page.getByRole('tab', { name: 'Catálogo' }).click()
      await page.getByRole('searchbox', { name: 'Filtrar catálogo' }).fill('caddy')

      await expect(page.getByRole('heading', { name: 'Docker Hub' })).toBeVisible()
      await expect(row(page, 'comunidade/caddy')).toBeVisible()
      await expect(row(page, /^caddy/).getByText('oficial', { exact: true })).toBeVisible()
    })
  })
}

test.describe('Imagens · só no motor CLI', () => {
  test.beforeEach(async ({ page }) => {
    await goToImages(page)
  })

  test('inspeciona uma imagem', async ({ page }) => {
    await menuAction(page, 'Ações da imagem', 'Inspecionar', row(page, 'nginx'))

    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByText('"Architecture": "amd64"')).toBeVisible()
    await closeSheet(page)
  })

  test('salva uma imagem como arquivo', async ({ page }) => {
    await menuAction(page, 'Ações da imagem', 'Salvar como arquivo', row(page, 'nginx'))
    await expectToast(page, /Imagem "nginx:latest" salva em/)
  })

  /**
   * Imagem usada por um container só sai com -f. Em vez de mais um item de
   * menu perigoso, a saída forçada é um botão no aviso da falha — quem clica
   * já leu o motivo.
   */
  test('remover imagem em uso oferece forçar no próprio aviso', async ({ page }) => {
    await menuAction(page, 'Ações da imagem', 'Remover', row(page, 'nginx'))
    await confirm(page, 'Remover')

    await expectToast(page, /está em uso pelo contêiner "web"/)
    await expect(row(page, 'nginx')).toBeVisible()

    await toasts(page).getByRole('button', { name: 'Remover mesmo assim' }).first().click()
    await expectToast(page, 'Imagem "nginx:latest" removida.')
    await expect(page.getByRole('row').filter({ hasText: 'nginx' })).toHaveCount(0)
  })

  test('remove as imagens sem uso', async ({ page }) => {
    await menuAction(page, 'Mais ações', 'Remover imagens sem uso')
    await confirm(page, 'Remover sem uso')
    await expectToast(page, 'Imagens sem uso removidas.')
  })

  test('constrói uma imagem a partir de um Containerfile', async ({ page }) => {
    await page.getByRole('button', { name: 'Construir imagem a partir de um Containerfile' }).click()
    const dialog = modal(page)

    await expect(dialog.getByRole('button', { name: 'Iniciar build' })).toBeDisabled()
    await fillField(dialog, 'Tag da imagem', 'meu-app:latest')
    await dialog.getByRole('button', { name: 'Escolher pasta' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Pasta de contexto' })).toHaveValue(/demo/)

    await dialog.getByRole('button', { name: 'Iniciar build' }).click()
    await expect(page.getByText(/Build de meu-app:latest/).first()).toBeVisible()
    await expect(page.getByText(/PASSO 3\/3/)).toBeVisible()
    await expectStreamFinished(page, 0)
  })

  /**
   * As opções do build (a 2.9.8 trocou o motor por `docker buildx build`).
   * O dublê ecoa `--no-cache` e `--target` na saída: é o que prova que elas
   * chegaram à linha de comando, e não pararam no formulário.
   */
  test('o build avançado leva --no-cache e --target até a CLI', async ({ page }) => {
    await page.getByRole('button', { name: 'Construir imagem a partir de um Containerfile' }).click()
    const dialog = modal(page)

    await fillField(dialog, 'Tag da imagem', 'app:multi')
    await dialog.getByRole('button', { name: 'Escolher pasta' }).click()
    await fillTags(dialog, 'Argumentos de build', 'VERSION=1.2.0')
    await toggleSwitch(dialog, 'Ignorar o cache')

    await dialog.getByRole('tab', { name: 'Avançado' }).click()
    await fillField(dialog, 'Estágio alvo', 'builder')

    await dialog.getByRole('button', { name: 'Iniciar build' }).click()
    await expect(page.getByText(/FROM alpine:latest \(sem cache\)/)).toBeVisible()
    await expect(page.getByText(/COPY \. \/app até builder/)).toBeVisible()
    await expectStreamFinished(page, 0)
  })
})

test.describe('Imagens · ausências do motor nativo', () => {
  test.use({ engine: 'native' })

  test('sem build, inspect, save nem prune', async ({ page }) => {
    await goToImages(page)

    await expect(
      page.getByRole('button', { name: 'Construir imagem a partir de um Containerfile' })
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Mais ações' }).click()
    await expect(page.getByRole('menuitem', { name: 'Remover imagens sem uso' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await row(page, 'nginx').getByRole('button', { name: 'Ações da imagem' }).click()
    await expect(page.getByRole('menuitem', { name: 'Inspecionar' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Salvar como arquivo' })).toHaveCount(0)
  })

  test('o pull nativo mostra progresso por camada', async ({ page }) => {
    await goToImages(page)
    await fillField(page, 'Imagem para baixar', 'redis:7')
    await page.getByRole('button', { name: 'Baixar imagem (pull)' }).click()

    // Progresso estruturado: uma barra por camada, com rótulo de estágio.
    await expect(page.getByRole('progressbar', { name: /^Camada / }).first()).toBeVisible()
    await expectStreamFinished(page, 0)
  })
})

test.describe('Imagens · caminhos tristes', () => {
  test.describe('listagem indisponível', () => {
    test.use({ fail: ['images:list'] })

    test('mostra o erro na própria view', async ({ page }) => {
      await goToImages(page)
      await expectAlert(page, /Não foi possível listar as imagens/)
    })
  })

  test.describe('pull que falha', () => {
    test.use({ fail: ['images:pull'] })

    test('o painel de saída termina com código de erro', async ({ page }) => {
      await goToImages(page)
      await fillField(page, 'Imagem para baixar', 'redis:7')
      await page.getByRole('button', { name: 'Baixar imagem (pull)' }).click()

      await expect(page.getByText(/Erro: falha ao baixar redis:7/)).toBeVisible()
      await expectStreamFinished(page, 1)
    })
  })

  test.describe('push sem credenciais', () => {
    test.use({ fail: ['images:push'] })

    test('explica que falta login', async ({ page }) => {
      await goToImages(page)
      await menuAction(page, 'Ações da imagem', 'Push para registry', row(page, 'nginx'))

      await expect(page.getByText(/acesso negado ao registry/)).toBeVisible()
      await expectStreamFinished(page, 1)
    })
  })

  test.describe('tag recusada', () => {
    test.use({ fail: ['images:tag'] })

    test('avisa e mantém o diálogo aberto', async ({ page }) => {
      await goToImages(page)
      await menuAction(page, 'Ações da imagem', 'Nova tag', row(page, 'alpine'))
      await fillField(modal(page), 'Nova referência', 'x:1')
      await modal(page).getByRole('button', { name: 'Criar tag' }).click()

      await expectToast(page, /Falha ao criar a tag "x:1"/)
      await expect(modal(page)).toBeVisible()
    })
  })

  test.describe('login recusado', () => {
    test.use({ fail: ['registry:login'] })

    test('avisa e mantém o diálogo aberto', async ({ page }) => {
      await goToImages(page)
      await menuAction(page, 'Mais ações', 'Login em registry')
      await fillField(modal(page), 'Usuário', 'rafael')
      await fillField(modal(page), 'Senha ou token', 'errada')
      await modal(page).getByRole('button', { name: 'Entrar' }).click()

      await expectToast(page, /Usuário ou senha inválidos/)
      await expect(modal(page)).toBeVisible()
    })
  })

  test.describe('remoção recusada', () => {
    test.use({ fail: ['images:remove'] })

    test('a imagem continua na lista', async ({ page }) => {
      await goToImages(page)
      await menuAction(page, 'Ações da imagem', 'Remover', row(page, 'alpine'))
      await confirm(page, 'Remover')

      await expectToast(page, /Falha ao remover "alpine:latest"/)
      await expect(row(page, 'alpine')).toBeVisible()
    })
  })

  test.describe('Docker Hub fora do ar', () => {
    test.use({ fail: ['images:search-registry'] })

    test('a busca falha sem derrubar o catálogo local', async ({ page }) => {
      await goToImages(page)
      await page.getByRole('tab', { name: 'Catálogo' }).click()
      await page.getByRole('searchbox', { name: 'Filtrar catálogo' }).fill('caddy')

      await expectAlert(page, /Busca no Docker Hub falhou/)
      await expect(row(page, 'caddy')).toBeVisible()
    })
  })

  test.describe('escolha de arquivo cancelada', () => {
    test.use({ pick: 'cancel' })

    test('cancelar o diálogo não inicia nada', async ({ page }) => {
      await goToImages(page)
      await menuAction(page, 'Mais ações', 'Carregar imagem salva')

      await expect(page.getByText(/^Load de/)).toHaveCount(0)
    })
  })
})
