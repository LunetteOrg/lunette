import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'

type Env = { DATABASE_URL: string }

describe('seed (types)', () => {
  it('the seed is the starting context of the chain', () => {
    lunette<{ env: Env }>().use(async (ctx, next) => {
      expectTypeOf(ctx).toEqualTypeOf<{ env: Env }>()
      return next({ ok: true })
    })
  })

  it('without the seed, run and build do not compile', () => {
    const chain = lunette<{ env: Env }>().expose((ctx) => ({
      db: { url: ctx.env.DATABASE_URL },
    }))

    // @ts-expect-error — the seed is missing as the first argument
    chain.run(async (pub) => pub)

    // @ts-expect-error — build requires the seed
    chain.build()

    // @ts-expect-error — the seed has the wrong shape
    chain.run({ env: { WRONG: true } }, async (pub) => pub)
  })

  it('a chain without requirements does not accept a seed', () => {
    // @ts-expect-error — no requirements declared: only the scope
    lunette().run({ env: {} }, async (pub) => pub)
  })

  it('the seed does not appear on the public app type', async () => {
    const app = await lunette<{ env: Env }>()
      .expose((ctx) => ({ dbUrl: ctx.env.DATABASE_URL }))
      .run({ env: { DATABASE_URL: 'x' } }, async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ dbUrl: string }>()
  })
})

describe('reusable modules with requirements (types)', () => {
  const authModule = (ctx: { k: number; z: number }) => ({
    auth: { sum: () => ctx.k + ctx.z },
  })

  it('mounting where the requirements are missing is an error', () => {
    // @ts-expect-error — the chain has neither k nor z
    lunette().expose(authModule)

    // @ts-expect-error — k is there but z is missing
    lunette<{ k: number }>().expose(authModule)
  })
})

describe('visibility lives in the verb (types)', () => {
  it('the public app is only what went through expose', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'shh', db: { url: 'pg://x' } }))
      .expose(() => ({ auth: { whoami: (): string => 'g' } }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ auth: { whoami: () => string } }>()

    // @ts-expect-error — db is private: it does not exist on the app
    app.db
  })

  it('downstream steps see the WHOLE context, private included', () => {
    lunette()
      .provide(() => ({ secret: 'shh' }))
      .expose(() => ({ api: { ping: (): boolean => true } }))
      .use(async (ctx, next) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          secret: string
          api: { ping: () => boolean }
        }>()
        return next({ extra: 1 })
      })
  })
})
