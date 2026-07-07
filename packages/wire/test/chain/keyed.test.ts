// Keyed form of the verbs: provide('db', fn) / expose('auth', fn) /
// use('db', (ctx, next) => next(value)). Opt-in: declaring the key in
// the signature makes the layer SKIPPABLE by test(chain) — the function
// is never executed at all when the key is substituted.

import { describe, expect, it } from 'vitest'
import { lunette } from '../../src/index.ts'
import { fake, test } from '../../src/testing.ts'

type Db = { query: (sql: string) => Promise<string[]> }

describe('keyed form — normal behaviour', () => {
  it('keyed provide/expose provide under the declared key', async () => {
    const app = await lunette()
      .provide('greeting', () => 'hello')
      .expose('hello', (ctx) => (name: string) => `${ctx.greeting} ${name}`)
      .run(async (pub) => pub)

    expect(app.hello('world')).toBe('hello world')
    expect(Object.keys(app)).toEqual(['hello'])
  })

  it('keyed use: next receives the VALUE, teardown as always', async () => {
    const events: string[] = []

    await lunette()
      .use('db', async (_ctx, next) => {
        events.push('open')
        try {
          return await next({ query: async () => ['row'] } as Db)
        } finally {
          events.push('close')
        }
      })
      .expose('rows', (ctx) => () => ctx.db.query('select *'))
      .run(async (pub) => {
        expect(await pub.rows()).toEqual(['row'])
      })

    expect(events).toEqual(['open', 'close'])
  })

  it('a collision on the declared key is still an error', async () => {
    const chain = lunette()
      .provide('db', () => 1)
      // @ts-expect-error — compile-time guard; the runtime is the safety net
      .provide('db', () => 2)

    await expect(chain.run(() => {})).rejects.toThrow(
      /Keys already present in the context: db/,
    )
  })

  it('a WIDENED key slips past the types; the net throws at boot', async () => {
    // `Extract<string, 'db'>` is never: a key typed as plain string is
    // invisible to the literal-based guard (pre-existing on main,
    // decisions §4) — this net is what stands under it.
    const widened: string = 'db'
    const chain = lunette().provide('db', () => 1).provide(widened, () => 2)

    await expect(chain.run(() => {})).rejects.toThrow(
      /Keys already present in the context: db/,
    )
  })

  it('a WIDENED patch forced past the ban still hits the net', async () => {
    // The top-level widened patch is refused at compile time (decision
    // 32); a cast defeats any guard — this net is what stands under it.
    const chain = lunette()
      .provide('db', () => 1)
      // @ts-expect-error — compile-time ban; the runtime is the safety net
      .provide((): Record<string, unknown> => ({ db: 'clobbered' }))

    await expect(chain.run(() => {})).rejects.toThrow(
      /Keys already present in the context: db/,
    )
  })
})

describe('keyed form — the skip in tests', () => {
  it('substituted keyed use: the function does NOT run (no real resources)', async () => {
    let opened = false
    const chain = lunette()
      .use('db', async (_ctx, next) => {
        opened = true // ← in a real case: connection to the pool
        try {
          return await next({ query: async () => ['real'] } as Db)
        } finally {
          /* close */
        }
      })
      .expose('users', (ctx) => ({
        count: async () => (await ctx.db.query('select *')).length,
      }))

    await test(chain).run(
      { db: fake<Db>({ query: async () => ['a', 'b'] }) },
      async (app) => {
        expect(await app.users.count()).toBe(2)
      },
    )

    expect(opened).toBe(false) // the real layer was SKIPPED
  })

  it('substituted keyed expose: skipped but the key stays public', async () => {
    let wired = false
    const chain = lunette()
      .provide('db', () => fake<Db>({ query: async () => ['real'] }))
      .expose('users', (ctx) => {
        wired = true
        return { all: () => ctx.db.query('select *') }
      })

    await test(chain).run(
      { users: { all: async () => ['fake-user'] } },
      async (app) => {
        expect(await app.users.all()).toEqual(['fake-user'])
      },
    )

    expect(wired).toBe(false)
  })

  it('anonymous-patch layers remain substitutable-but-not-skippable', async () => {
    let ran = false
    const chain = lunette()
      .provide(() => {
        ran = true
        return { db: fake<Db>({ query: async () => ['real'] }) }
      })
      .expose('first', (ctx) => async () => (await ctx.db.query('s'))[0])

    await test(chain).run(
      { db: fake<Db>({ query: async () => ['fake'] }) },
      async (app) => {
        expect(await app.first()).toBe('fake')
      },
    )

    expect(ran).toBe(true) // without a declared key there is no skipping
  })
})
