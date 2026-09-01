import { z } from 'zod'

/**
 * PRECISA rodar antes de qualquer schema do contrato ser criado (este módulo
 * é importado PRIMEIRO no preload).
 *
 * O Zod v4 decide na CRIAÇÃO do schema se vai usar o fast-path JIT — e sonda
 * `new Function` num momento em que o preload ainda roda SEM a CSP da página.
 * A sonda passa, mas no primeiro `parse` (já com a CSP `default-src 'self'`
 * ativa) o codegen estoura "EvalError: Code generation from strings
 * disallowed", derrubando em silêncio TODOS os eventos main → renderer.
 * `jitless` força o caminho interpretado desde o início.
 */
z.config({ jitless: true })
