import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'

type Env = { DATABASE_URL: string }

const authChain = lunette<{ env: Env }>()
  .provide(({ env }) => ({ authDb: { url: env.DATABASE_URL } }))
  .expose(({ authDb }) => ({ auth: { whoami: (): string => authDb.url } }))

describe('mount (types)', () => {
  it("only the fragment's Pub crosses the boundary", async () => {
    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env }))
      .expose(authChain)
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ auth: { whoami: () => string } }>()

    // @ts-expect-error — authDb is private to the fragment: it does not exist here
    app.authDb
  })

  it('use(chain): the mounted Pub is private in the host but visible downstream', async () => {
    const infra = lunette().expose(() => ({ db: { url: 'pg://x' } }))

    const app = await lunette()
      .use(infra)
      .expose((ctx) => {
        expectTypeOf(ctx.db).toEqualTypeOf<{ url: string }>()
        return { api: { where: (): string => ctx.db.url } }
      })
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ api: { where: () => string } }>()

    // @ts-expect-error — db is private: mounted with use, not with expose
    app.db
  })

  it("mounting without satisfying the fragment's Seed is an error", () => {
    const chain = lunette().expose(authChain)

    expectTypeOf(chain).toEqualTypeOf<{
      '⛔ fragment requirements not satisfied': { env: Env }
    }>()

    // @ts-expect-error — the error type cannot be chained further
    chain.run(async () => {})
  })

  it('.as renames the Pub in the type and propagates the Seed', async () => {
    const renamed = authChain.as('http')

    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env }))
      .expose(renamed)
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{
      http: { auth: { whoami: () => string } }
    }>()

    // the Seed survives .as: without env the chain stops with the error type
    const bad = lunette().expose(renamed)
    expectTypeOf(bad).toEqualTypeOf<{
      '⛔ fragment requirements not satisfied': { env: Env }
    }>()
  })

  it("the seed mapper is checked against the fragment's requirements", () => {
    lunette()
      .provide(() => ({ mainEnv: { DATABASE_URL: 'x' } as Env }))
      // @ts-expect-error — the mapper does not produce { env: Env }
      .expose(authChain, ({ mainEnv }) => ({ wrong: mainEnv }))
  })
})
