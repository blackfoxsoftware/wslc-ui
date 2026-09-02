import { expect, test } from './fixtures/app'
import { goto, modal, openTab } from './fixtures/ui'

/**
 * View transitions, no app empacotado.
 *
 * O que estes testes medem é a FIAÇÃO, que é o que pode quebrar em silêncio:
 * se o tipo certo chega ao Chrome (é o tipo que seleciona a coreografia em
 * design/motion.css) e se a transição realmente ACONTECEU. O segundo é o mais
 * valioso: `view-transition-name` repetido em dois elementos vivos faz o Chrome
 * descartar a transição inteira sem erro na tela e sem erro no console — o
 * sintoma é só "parou de animar". Uma transição descartada rejeita `ready`, e é
 * disso que o espião abaixo se aproveita.
 *
 * Nada aqui olha pixel: quadro no meio de animação é o tipo de asserção que
 * falha por causa da máquina, não do código.
 */

interface Registro {
  types: string[]
  ready: string
}

type Espiao = { vtRegistros: Registro[] }

/** Troca `document.startViewTransition` por um espião que ainda chama o original. */
async function espionar(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const alvo = window as unknown as Espiao
    alvo.vtRegistros = []
    const original = document.startViewTransition.bind(document)
    document.startViewTransition = (arg) => {
      const registro: Registro = {
        types: typeof arg === 'object' && arg?.types ? [...arg.types] : [],
        ready: 'pendente'
      }
      alvo.vtRegistros.push(registro)
      const transicao = original(arg)
      transicao.ready.then(
        () => {
          registro.ready = 'ok'
        },
        (erro: Error) => {
          registro.ready = `descartada (${erro.name})`
        }
      )
      return transicao
    }
  })
}

/**
 * As transições nossas. As do HeroUI (fila de toasts) não têm tipo, e é
 * exatamente assim que as duas coreografias não se misturam.
 */
async function nossas(page: import('@playwright/test').Page): Promise<Registro[]> {
  // Espera a promessa `ready` assentar antes de ler o veredito.
  await page.waitForTimeout(400)
  const todas = await page.evaluate(() => (window as unknown as Espiao).vtRegistros)
  return todas.filter((r) => r.types.length > 0)
}

test.describe('Transições', () => {
  test('descer no rail é "forward", subir é "back"', async ({ page }) => {
    await espionar(page)

    await goto(page, 'Sistema')
    expect(await nossas(page)).toEqual([{ types: ['nav', 'forward'], ready: 'ok' }])

    await page.evaluate(() => {
      ;(window as unknown as Espiao).vtRegistros = []
    })
    await goto(page, 'Containers')
    expect(await nossas(page)).toEqual([{ types: ['nav', 'back'], ready: 'ok' }])
  })

  test('trocar de aba usa o eixo da faixa, para a direita e para a esquerda', async ({ page }) => {
    await goto(page, 'Sistema')
    await espionar(page)

    await openTab(page, 'API nativa')
    expect(await nossas(page)).toEqual([{ types: ['tab', 'forward'], ready: 'ok' }])

    await page.evaluate(() => {
      ;(window as unknown as Espiao).vtRegistros = []
    })
    await openTab(page, 'Motor')
    expect(await nossas(page)).toEqual([{ types: ['tab', 'back'], ready: 'ok' }])
  })

  test('clicar na aba que já está aberta não transiciona nada', async ({ page }) => {
    await goto(page, 'Sistema')
    await espionar(page)

    await openTab(page, 'Ambiente')

    expect(await nossas(page)).toEqual([])
  })

  // A regressão que motivou o nome por instância: o diálogo de build tem abas e
  // abre EM CIMA de Imagens, que também tem abas. Se os dois painéis usassem o
  // mesmo `view-transition-name`, a transição seria descartada — e o teste vê
  // isso no veredito de `ready`, não num pixel.
  test('as abas de um diálogo transicionam mesmo com as abas da view atrás', async ({ page }) => {
    await goto(page, 'Imagens')
    await page.getByRole('button', { name: 'Construir imagem' }).click()
    await expect(modal(page)).toBeVisible()
    await espionar(page)

    await openTab(page, 'Avançado')

    expect(await nossas(page)).toEqual([{ types: ['tab', 'forward'], ready: 'ok' }])
  })

  test('cliques em rajada não perdem estado no caminho', async ({ page }) => {
    await goto(page, 'Sistema')

    for (const aba of ['Motor', 'API nativa', 'Atualizações', 'Ambiente', 'Motor']) {
      // oxlint-disable-next-line no-await-in-loop -- a rajada é sequencial de propósito
      await page.getByRole('tab', { name: aba, exact: true }).click()
    }

    // Sobreviver à rajada é o que importa: `flushSync` não pode engolir
    // atualização, e transição abortada não pode deixar a UI num meio-estado.
    await expect(page.getByRole('tab', { name: 'Motor', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('heading', { name: 'Motor de execução', level: 2 })).toBeVisible()
  })

  test('quem pediu menos movimento navega sem transição nenhuma', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await espionar(page)

    await goto(page, 'Volumes')
    await goto(page, 'Sistema')
    await openTab(page, 'Motor')

    expect(await nossas(page)).toEqual([])
  })
})
