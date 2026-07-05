import { describe, expect, it } from 'vitest'
import { bind, lazy, lunette } from './index.ts'
import { fake, test } from './testing.ts'

type Db = {
  query: (sql: string) => Promise<string[]>
  close: () => Promise<void>
}

describe('fake — strict partial stubs', () => {
  it('stubbed members respond, the rest throws with the name', async () => {
    const db = fake<Db>({ query: async () => ['row1'] })

    expect(await db.query('select 1')).toEqual(['row1'])
    expect(() => db.close).toThrow('fake: property not stubbed: close')
  })

  it('survives await and serialization (structural accesses)', async () => {
    const db = fake<Db>()

    // a fake awaited by mistake does not blow up on the `then` check
    expect(await db).toBe(db)
  })
})

// ── the canonical pattern: THE SEED IS THE MOCK BOUNDARY ─────────────────
// The wiring declares the infra as a requirement; in tests it is handed
// in fake from the seed, and the real infra is never even CREATED.

const modules = lunette<{ db: Db }>().expose(({ db }) => ({
  users: { count: async () => (await db.query('select *')).length },
}))

describe('the canonical pattern: a seed of fakes', () => {
  it('in tests: run with the fakes in the seed — zero real infra', async () => {
    await modules.run(
      { db: fake<Db>({ query: async () => ['a', 'b'] }) },
      async (app) => {
        expect(await app.users.count()).toBe(2)
      },
    )
  })

  it('in production: the SAME fragment mounted after the real infra', async () => {
    const prod = lunette()
      .provide(() => ({ db: fake<Db>({ query: async () => ['prod-only'] }) }))
      .expose(modules)

    await prod.run(async (app) => {
      expect(await app.users.count()).toBe(1)
    })
  })

  it('every run is an instance: the layers run again, no shared state', async () => {
    let creations = 0
    const chain = lunette()
      .provide(() => {
        creations += 1
        return { db: fake<Db>({ query: async () => [] }) }
      })
      .expose(modules)

    await chain.run(async (app) => void (await app.users.count()))
    await chain.run(async (app) => void (await app.users.count()))

    expect(creations).toBe(2)
  })
})

// ── test(chain): per-key substitutions, no restructuring ─────────────────
// For when the seed boundary is not ergonomic: the test run accepts an
// input that substitutes keys AT BIRTH, wherever the provide sits.

describe('test(chain) — mocking a provide in the middle of the chain', () => {
  type Db2 = { query: (sql: string) => Promise<string[]> }

  it('downstream closures receive the fake (but the real layer runs)', async () => {
    let realCreated = false
    const chain = lunette()
      .provide(() => {
        realCreated = true
        return { db: { query: async (_sql: string) => ['real'] } as Db2 }
      })
      .expose(({ db }) => ({
        users: { count: async () => (await db.query('select *')).length },
      }))

    await test(chain).run(
      { db: fake<Db2>({ query: async () => ['a', 'b', 'c'] }) },
      async (app) => {
        expect(await app.users.count()).toBe(3)
      },
    )

    // documented physical caveat: the real provide ran anyway — to zero
    // out the creation too: lazy() (below) or the seed boundary
    expect(realCreated).toBe(true)
  })

  it('with lazy() the real resource never starts at all', async () => {
    let opened = false
    const chain = lunette()
      .provide(() => ({
        db: lazy(() => {
          opened = true
          return { query: async (_sql: string) => ['real'] } as Db2
        }),
      }))
      .expose(({ db }) => ({
        users: { first: async () => (await db().query('select *'))[0] },
      }))

    await test(chain).run(
      { db: lazy(() => fake<Db2>({ query: async () => ['fake'] })) },
      async (app) => {
        expect(await app.users.first()).toBe('fake')
      },
    )

    expect(opened).toBe(false) // the real pool NEVER opened
  })

  it('seed and substitutions travel in the same input', async () => {
    const chain = lunette<{ env: { url: string } }>()
      .provide(({ env }) => ({ db: { query: async () => [env.url] } }))
      .expose(({ db }) => ({ probe: { first: async () => (await db.query())[0] } }))

    await test(chain).run(
      { env: { url: 'pg://never-used' }, db: { query: async () => ['fake'] } },
      async (app) => {
        expect(await app.probe.first()).toBe('fake')
      },
    )
  })
})

// ── bound leaves are substitutable like any ctx key ──────────────────────
// The record braces do not cost the REPLACE: substitution works on every
// top-level key, patch form included (drop at birth). What the keyed form
// adds is only the SKIP — worth it for layers that create resources; a
// binder only creates closures, so there is nothing to skip.

describe('test(chain) — substituting a bound leaf (point-free expose)', () => {
  type Db2 = { query: (sql: string) => Promise<string[]> }

  const getAuthor = async (deps: { db: Db2 }, id: string): Promise<string> =>
    `real:${(await deps.db.query('select'))[0] ?? id}`

  // the composition edge: greet consumes the BOUND getAuthor from the ctx
  const greet = async (
    deps: { getAuthor: (id: string) => Promise<string> },
    id: string,
  ) => `hello ${await deps.getAuthor(id)}`

  it('the fake reaches both the composers and the delivered app', async () => {
    const chain = lunette()
      .provide(() => ({ db: { query: async () => [] } as Db2 }))
      .expose(bind({ getAuthor }))
      .expose(bind({ greet }))

    await test(chain).run(
      { getAuthor: async (id: string) => `fake:${id}` },
      async (app) => {
        expect(await app.getAuthor('u1')).toBe('fake:u1') // the pub delivers the fake
        expect(await app.greet('u1')).toBe('hello fake:u1') // the composer wired to it
      },
    )
  })
})

// ── the documented pitfall: override is POSITIONAL ───────────────────────

describe('override in tests: affects downstream layers, does not rewrite closures', () => {
  const explodingDb = (): Db =>
    fake<Db>({
      query: async () => {
        throw new Error('the real db must not be touched!')
      },
    })

  it('appended AFTER the wiring arrives too late', async () => {
    const chain = lunette()
      .provide(() => ({ db: explodingDb() }))
      .expose(({ db }) => ({
        users: { count: async () => (await db.query('select *')).length },
      }))
      // users has ALREADY captured the real db in the closure: this
      // override changes the context only for later layers (here: none)
      .override(() => ({ db: fake<Db>({ query: async () => [] }) }))

    await chain.run(async (app) => {
      await expect(app.users.count()).rejects.toThrow(
        'the real db must not be touched!',
      )
    })
  })

  it('BEFORE the consumers it works — but the original layer still runs', async () => {
    let realCreated = false
    const chain = lunette()
      .provide(() => {
        realCreated = true // ← in a real case the pool would open here!
        return { db: explodingDb() }
      })
      .override(() => ({ db: fake<Db>({ query: async () => ['x'] }) }))
      .expose(({ db }) => ({
        users: { count: async () => (await db.query('select *')).length },
      }))

    await chain.run(async (app) => {
      expect(await app.users.count()).toBe(1)
    })
    // it works, but the real creation happened: for tests the right
    // boundary remains the seed, where the real infra never runs at all
    expect(realCreated).toBe(true)
  })
})
