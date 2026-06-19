import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'

describe('the verb model (types)', () => {
  it('expose(fn, destroy): value is public, destroy param is inferred', async () => {
    const app = await lunette()
      .expose(
        'db',
        () => ({ q: (): number => 1 }),
        (db) => {
          expectTypeOf(db).toEqualTypeOf<{ q: () => number }>()
        },
      )
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ db: { q: () => number } }>()
  })

  it('provide(fn, destroy): value stays private, destroy param is inferred', async () => {
    const app = await lunette()
      .provide('secret', () => 's', (v) => {
        expectTypeOf(v).toEqualTypeOf<string>()
      })
      .expose('len', (ctx) => ctx.secret.length)
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ len: number }>()
  })

  it('use next(priv, pub): only pub is public, both live in the downstream Ctx', async () => {
    const app = await lunette()
      .use(async (_ctx, next) => next({ pool: 1 }, { db: 2 }))
      .use(async (ctx, next) => {
        expectTypeOf(ctx).toEqualTypeOf<{ pool: number; db: number }>()
        return next({})
      })
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ db: number }>()
  })

  it('use next(priv) alone contributes privately (Pub unchanged)', async () => {
    const app = await lunette()
      .expose('shown', () => 1)
      .use(async (_ctx, next) => next({ hidden: 2 }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ shown: number }>()
  })
})
