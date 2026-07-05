// Two-sided composition (alla Hono Bindings / Effect Layer<RIn, ROut>) +
// visibility lives in the verb:
// - Seed: requirements declared as a generic of the chain, NOT built by
//   the layers but delivered to run/build — the classic env case.
//   The seed is private: it does not end up on the public app.
// - use/provide are private, expose is public: the app delivered by
//   run/build contains ONLY what went through expose, in the type and at
//   runtime.
// - reusable modules with requirements: the contravariance of use/expose
//   rejects a function that requires keys absent from the context.

import { describe, expect, it } from 'vitest'
import { lunette } from './index.ts'

type Env = { DATABASE_URL: string }

describe('seed — requirements satisfied at run/build', () => {
  it('run receives the seed as the first argument', async () => {
    const chain = lunette<{ env: Env }>().expose((ctx) => ({
      db: { url: ctx.env.DATABASE_URL },
    }))

    const url = await chain.run(
      { env: { DATABASE_URL: 'pg://seeded' } },
      async (pub) => pub.db.url,
    )

    expect(url).toBe('pg://seeded')
  })

  it('the seed is private: it does not appear on the public app', async () => {
    const keys = await lunette<{ env: Env }>()
      .expose((ctx) => ({ dbUrl: ctx.env.DATABASE_URL }))
      .run({ env: { DATABASE_URL: 'pg://x' } }, async (pub) => Object.keys(pub))

    expect(keys).toEqual(['dbUrl'])
  })

  it('build receives the seed and delivers app + dispose as always', async () => {
    const teardowns: string[] = []
    const chain = lunette<{ env: Env }>()
      .use(async (ctx, next) => {
        try {
          return await next({ db: { url: ctx.env.DATABASE_URL } })
        } finally {
          teardowns.push('db')
        }
      })
      .expose((ctx) => ({ api: { url: () => ctx.db.url } }))

    const { app, dispose } = await chain.build({
      env: { DATABASE_URL: 'pg://built' },
    })

    expect(app.api.url()).toBe('pg://built')
    await dispose()
    expect(teardowns).toEqual(['db'])
  })
})

describe('reusable modules with requirements (the "auth requires K and Z" case)', () => {
  const authModule = (ctx: { k: number; z: number }) => ({
    auth: { sum: () => ctx.k + ctx.z },
  })

  it('mounts on a chain that declares the requirements in the seed', async () => {
    const total = await lunette<{ k: number; z: number }>()
      .expose(authModule)
      .run({ k: 1, z: 2 }, async (pub) => pub.auth.sum())

    expect(total).toBe(3)
  })

  it('requirements can also be satisfied with PRIVATE keys', async () => {
    // exposing auth does not require exposing k and z: the requirement is
    // on Ctx, visibility is a separate thing
    const total = await lunette()
      .provide(() => ({ k: 10, z: 20 }))
      .expose(authModule)
      .run(async (pub) => pub.auth.sum())

    expect(total).toBe(30)
  })
})

describe('expose — visibility lives in the verb', () => {
  it('use/provide stay private, expose is public', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'shh', db: { url: 'pg://x' } }))
      .expose((ctx) => ({ auth: { whoami: () => `user@${ctx.db.url}` } }))
      .run(async (pub) => pub)

    expect(app.auth.whoami()).toBe('user@pg://x')
    expect(Object.keys(app)).toEqual(['auth'])
    expect('db' in app).toBe(false)
    expect('secret' in app).toBe(false)
  })

  it('downstream steps also see the private part (needed for wiring)', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'shh' }))
      .expose((ctx) => ({ probe: { reveal: () => ctx.secret } }))
      .run(async (pub) => pub)

    expect(app.probe.reveal()).toBe('shh')
  })

  it('the teardown of private layers still runs', async () => {
    const teardowns: string[] = []

    await lunette()
      .use(async (_ctx, next) => {
        try {
          return await next({ db: { open: true } })
        } finally {
          teardowns.push('db')
        }
      })
      .expose((ctx) => ({ api: { ping: () => ctx.db.open } }))
      .run(async (pub) => {
        expect(pub.api.ping()).toBe(true)
      })

    expect(teardowns).toEqual(['db'])
  })
})
