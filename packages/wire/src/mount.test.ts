// Mount: use/expose accept another chain. Only the fragment's Pub
// crosses the boundary; the verb decides its visibility in the host; the
// fragment's Seed is satisfied by the host (lexical scoping) or by the
// explicit mapper (which doubles as an adapter/renamer). One lifecycle.

import { describe, expect, it } from 'vitest'
import { bind, lunette } from './index.ts'

type Env = { DATABASE_URL: string }

describe('mount — boundary and visibility', () => {
  // a fragment with its own privates and external requirements
  const makeAuthChain = () =>
    lunette<{ env: Env }>()
      .provide(({ env }) => ({ authDb: { url: env.DATABASE_URL, secret: true } }))
      .expose(({ authDb }) => ({
        auth: { whoami: () => `user@${authDb.url}` },
      }))

  it("expose(chain): the fragment's Pub becomes public in the host", async () => {
    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'pg://host' } }))
      .expose(makeAuthChain())
      .run(async (pub) => pub)

    expect(app.auth.whoami()).toBe('user@pg://host')
    expect(Object.keys(app)).toEqual(['auth'])
  })

  it("use(chain): the fragment's Pub stays private in the host", async () => {
    // an infrastructure fragment: it exposes db as ITS contract...
    const infra = lunette().expose(() => ({ db: { url: 'pg://infra' } }))

    const app = await lunette()
      .use(infra) // ...but the host uses it for wiring, it does not deliver it
      .expose(({ db }) => ({ api: { where: () => db.url } }))
      .run(async (pub) => pub)

    expect(app.api.where()).toBe('pg://infra')
    expect(Object.keys(app)).toEqual(['api'])
    expect('db' in app).toBe(false)
  })

  it("the fragment's privates never enter the host (no collisions)", async () => {
    const fragment = lunette()
      .provide(() => ({ secret: 'fragment-own' }))
      .expose(({ secret }) => ({ frag: { reveal: () => secret } }))

    const app = await lunette()
      .expose(fragment)
      // the host can have its OWN secret: the fragment's lives elsewhere
      .provide(() => ({ secret: 'host-own' }))
      .expose(({ secret }) => ({ host: { reveal: () => secret } }))
      .run(async (pub) => pub)

    expect(app.frag.reveal()).toBe('fragment-own')
    expect(app.host.reveal()).toBe('host-own')
  })

  it("lexical scoping: a fragment key SHADOWS the host's same-named key", async () => {
    const fragment = lunette()
      .provide(() => ({ db: { url: 'pg://fragment-own' } }))
      .expose(({ db }) => ({ frag: { where: () => db.url } }))

    const app = await lunette()
      .provide(() => ({ db: { url: 'pg://host-own' } }))
      .expose(fragment) // no error: the inner db shadows
      .expose(({ db }) => ({ host: { where: () => db.url } }))
      .run(async (pub) => pub)

    expect(app.frag.where()).toBe('pg://fragment-own')
    expect(app.host.where()).toBe('pg://host-own') // the host was not touched
  })

  it('the explicit mapper adapts names at the boundary', async () => {
    const app = await lunette()
      .provide(() => ({ mainEnv: { DATABASE_URL: 'pg://renamed' } }))
      .expose(makeAuthChain(), ({ mainEnv }) => ({ env: mainEnv }))
      .run(async (pub) => pub)

    expect(app.auth.whoami()).toBe('user@pg://renamed')
  })

  it("one lifecycle: the fragment's teardown joins the host onion", async () => {
    const order: string[] = []

    const fragment = lunette().use(async (_ctx, next) => {
      try {
        return await next({ fragRes: true })
      } finally {
        order.push('fragment')
      }
    })

    await lunette()
      .use(async (_ctx, next) => {
        try {
          return await next({ before: true })
        } finally {
          order.push('host:before')
        }
      })
      .use(fragment)
      .use(async (_ctx, next) => {
        try {
          return await next({ after: true })
        } finally {
          order.push('host:after')
        }
      })
      .run(async () => {})

    expect(order).toEqual(['host:after', 'fragment', 'host:before'])
  })
})

describe('mount — namespacing via the alias pattern (no dedicated API)', () => {
  it('two fragments exposing the same key get wrapped', async () => {
    const fragmentA = lunette().expose(() => ({ router: { name: 'A' } }))
    const fragmentB = lunette().expose(() => ({ router: { name: 'B' } }))

    // the wrapper IS the alias at the chain level: mount privately,
    // re-expose under the key the host picks
    const ha = lunette()
      .use(fragmentA)
      .expose(({ router }) => ({ ha: { router } }))
    const hb = lunette()
      .use(fragmentB)
      .expose(({ router }) => ({ hb: { router } }))

    const app = await lunette()
      .expose(ha)
      .expose(hb)
      .run(async (pub) => pub)

    expect(app.ha.router.name).toBe('A')
    expect(app.hb.router.name).toBe('B')
    expect(Object.keys(app)).toEqual(['ha', 'hb'])
  })
})

describe('mount — .as(name): the sugar over the wrapper pattern', () => {
  const fragmentA = () => lunette().expose(() => ({ router: { name: 'A' } }))
  const fragmentB = () => lunette().expose(() => ({ router: { name: 'B' } }))

  it("renames the fragment's Pub at mount time", async () => {
    const app = await lunette()
      .expose(fragmentA().as('ha'))
      .expose(fragmentB().as('hb'))
      .run(async (pub) => pub)

    expect(app.ha.router.name).toBe('A')
    expect(app.hb.router.name).toBe('B')
    expect(Object.keys(app)).toEqual(['ha', 'hb'])
  })

  it('with the use verb the namespace stays private', async () => {
    const app = await lunette()
      .use(fragmentA().as('ha'))
      .expose(({ ha }) => ({ api: { who: () => ha.router.name } }))
      .run(async (pub) => pub)

    expect(app.api.who()).toBe('A')
    expect(Object.keys(app)).toEqual(['api'])
  })

  it("the fragment's Seed propagates through .as", async () => {
    const needsEnv = lunette<{ env: Env }>().expose(({ env }) => ({
      router: { where: () => env.DATABASE_URL },
    }))

    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'pg://as' } }))
      .expose(needsEnv.as('http'))
      .run(async (pub) => pub)

    expect(app.http.router.where()).toBe('pg://as')
  })

  it('run directly, a renamed chain does not leak its seed', async () => {
    const chain = lunette<{ env: Env }>()
      .expose(({ env }) => ({ router: { where: () => env.DATABASE_URL } }))
      .as('http')

    const app = await chain.run(
      { env: { DATABASE_URL: 'pg://direct' } },
      async (pub) => pub,
    )

    expect(Object.keys(app)).toEqual(['http'])
    expect('env' in app).toBe(false)
  })
})

describe('mount — a complete auth fragment', () => {
  type OtpRepo = { consume: (code: string) => Promise<boolean> }
  const requestOtp = async (
    { otpRepo }: { otpRepo: OtpRepo },
    input: { email: string },
  ) => ((await otpRepo.consume('1234')) ? `otp for ${input.email}` : 'no')

  const authChain = lunette<{ env: Env }>()
    .provide(({ env }) => ({
      otpRepo: { consume: async (_c: string) => env.DATABASE_URL !== '' },
    }))
    .expose((ctx) => ({ auth: bind(ctx, { requestOtp }) }))

  it('mounts, inherits env from the host, exposes only auth', async () => {
    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'pg://app' } }))
      .expose(authChain)
      .run(async (pub) => pub)

    expect(await app.auth.requestOtp({ email: 'a@b.c' })).toBe('otp for a@b.c')
    expect(Object.keys(app)).toEqual(['auth'])
  })
})
