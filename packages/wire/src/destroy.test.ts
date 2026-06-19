import { describe, expect, it } from 'vitest'
import { lunette } from './index.ts'

describe('provide/expose teardown via the destroy argument', () => {
  it('expose(create, destroy): value is public and destroy runs on dispose', async () => {
    const events: string[] = []
    const chain = lunette().expose(
      'db',
      () => {
        events.push('create')
        return { q: () => 1 }
      },
      () => {
        events.push('destroy')
      },
    )

    const { app, dispose } = await chain.build()
    expect(app.db.q()).toBe(1)
    expect(events).toEqual(['create'])

    await dispose()
    expect(events).toEqual(['create', 'destroy'])
  })

  it('destroy receives the created value', async () => {
    let closed: number | undefined
    const { dispose } = await lunette()
      .expose(
        'pool',
        () => ({ id: 42 }),
        (pool) => {
          closed = pool.id
        },
      )
      .build()

    await dispose()
    expect(closed).toBe(42)
  })

  it('provide(create, destroy): value stays private, destroy still runs', async () => {
    const events: string[] = []
    const { app, dispose } = await lunette()
      .provide('secret', () => 's', () => {
        events.push('destroy secret')
      })
      .expose('pub', ({ secret }) => secret.toUpperCase())
      .build()

    expect(app).toEqual({ pub: 'S' })
    expect('secret' in app).toBe(false)

    await dispose()
    expect(events).toEqual(['destroy secret'])
  })

  it('teardown runs in reverse (onion) order', async () => {
    const events: string[] = []
    const { dispose } = await lunette()
      .provide('a', () => 1, () => {
        events.push('destroy a')
      })
      .provide('b', () => 2, () => {
        events.push('destroy b')
      })
      .build()

    await dispose()
    expect(events).toEqual(['destroy b', 'destroy a'])
  })

  it('the patch form passes the whole patch to destroy', async () => {
    let seen: { db: number } | undefined
    const { dispose } = await lunette()
      .expose(
        () => ({ db: 7 }),
        (patch) => {
          seen = patch
        },
      )
      .build()

    await dispose()
    expect(seen).toEqual({ db: 7 })
  })
})

describe('use as the primitive: next(priv, pub)', () => {
  it('publishes only the pub argument; priv is private but usable downstream', async () => {
    const app = await lunette()
      .use(async (_ctx, next) => {
        const pool = { q: () => 7 }
        return next({ pool }, { db: { query: () => pool.q() } })
      })
      .use(async ({ pool, db }, next) => next({ used: pool.q() + db.query() }))
      .run((a) => a)

    expect('db' in app).toBe(true)
    expect('pool' in app).toBe(false)
    expect('used' in app).toBe(false)
    expect((app as { db: { query: () => number } }).db.query()).toBe(7)
  })

  it('next(priv) alone keeps everything private', async () => {
    const app = await lunette()
      .use(async (_ctx, next) => next({ internal: 1 }))
      .run((a) => a)

    expect(app).toEqual({})
  })
})
