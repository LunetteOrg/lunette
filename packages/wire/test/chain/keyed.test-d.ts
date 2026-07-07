import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from '../../src/index.ts'

describe('keyed form (types)', () => {
  it('the key and the value end up in the context and on the surface', async () => {
    const app = await lunette()
      .provide('n', () => 42)
      .use('db', async (ctx, next) => {
        expectTypeOf(ctx.n).toEqualTypeOf<number>()
        return next({ url: `pg://${ctx.n}` })
      })
      .expose('api', (ctx) => ({ where: (): string => ctx.db.url }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ api: { where: () => string } }>()
  })

  it('a collision on the keyed key is rejected at the key literal', () => {
    const chain = lunette()
      .provide('db', () => 1)
      // @ts-expect-error — 'db' is already in the context: the key is rejected
      .provide('db', () => 2)

    // the chain keeps typing past the red line
    expectTypeOf(chain.run).toBeFunction()
  })

  it('keyed use: V is inferred from the value passed to next', async () => {
    const app = await lunette()
      .use('db', async (_ctx, next) => next({ q: (): string => 'x' }))
      .expose('probe', (ctx) => () => ctx.db.q())
      .run(async (pub) => pub)

    expectTypeOf(app.probe()).toEqualTypeOf<string>()
  })
})
