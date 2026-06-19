import { describe, expectTypeOf, it } from 'vitest'
import { layer, lunette } from './index.ts'

describe('type-level stress', () => {
  it('inference and the type checker hold up over a 20-step chain', async () => {
    const chain = lunette()
      .expose(() => ({ s01: 1 }))
      .expose((ctx) => ({ s02: ctx.s01 + 1 }))
      .expose((ctx) => ({ s03: ctx.s02 + 1 }))
      .expose((ctx) => ({ s04: ctx.s03 + 1 }))
      .expose((ctx) => ({ s05: ctx.s04 + 1 }))
      .expose((ctx) => ({ s06: ctx.s05 + 1 }))
      .expose((ctx) => ({ s07: ctx.s06 + 1 }))
      .expose((ctx) => ({ s08: ctx.s07 + 1 }))
      .expose((ctx) => ({ s09: ctx.s08 + 1 }))
      .expose((ctx) => ({ s10: ctx.s09 + 1 }))
      .expose((ctx) => ({ s11: `${ctx.s10}` }))
      .expose((ctx) => ({ s12: ctx.s11.length }))
      .expose((ctx) => ({ s13: ctx.s12 + 1 }))
      .expose((ctx) => ({ s14: ctx.s13 + 1 }))
      .expose((ctx) => ({ s15: ctx.s14 + 1 }))
      .expose((ctx) => ({ s16: ctx.s15 + 1 }))
      .expose((ctx) => ({ s17: ctx.s16 + 1 }))
      .expose((ctx) => ({ s18: ctx.s17 + 1 }))
      .expose((ctx) => ({ s19: ctx.s18 + 1 }))
      .expose((ctx) => ({ s20: ctx.s19 + 1 }))

    const total = await chain.run(async (app) => {
      expectTypeOf(app.s01).toEqualTypeOf<number>()
      expectTypeOf(app.s11).toEqualTypeOf<string>()
      expectTypeOf(app.s20).toEqualTypeOf<number>()
      return app.s20
    })

    expectTypeOf(total).toEqualTypeOf<number>()
  })

  it('a layer cannot avoid calling next', () => {
    // Provided is an opaque brand: the only way to produce it is next(patch).
    // Returning the bare patch does not compile.
    // @ts-expect-error — the return value must be the result of next
    lunette().use(async (_ctx) => ({ env: 'x' }))
  })

  it('reusable layers out of order remain an error', () => {
    const needsDb = layer(async (ctx: { db: { url: string } }, next) =>
      next({ repo: ctx.db.url }),
    )

    // @ts-expect-error — the chain starts from {} and needsDb requires db
    lunette().use(needsDb)
  })

  it('run propagates the scope return type', async () => {
    const out = await lunette()
      .expose(() => ({ n: 42 }))
      .run(async (app) => ({ doubled: app.n * 2 }))

    expectTypeOf(out).toEqualTypeOf<{ doubled: number }>()
  })
})
