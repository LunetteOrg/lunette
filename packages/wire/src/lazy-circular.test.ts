// VALUE-level helpers (the layer algebra knows nothing about them):
// - lazy/lazyAsync: expensive creations deferred to the first call,
//   teardown only if the creation actually started
// - circular: escape hatch for cycles in legacy codebases — one side of
//   the cycle becomes a getter at runtime

import { describe, expect, it } from 'vitest'
import { circular, lazy, lazyAsync, lunette } from './index.ts'

describe('lazy — expensive creations deferred to the first call', () => {
  it('does not create until someone calls, creates ONCE only', () => {
    let creations = 0
    const db = lazy(() => {
      creations += 1
      return { pool: 'ready' }
    })

    expect(creations).toBe(0)
    expect(db.created()).toBe(false)

    expect(db().pool).toBe('ready')
    expect(db().pool).toBe('ready')
    expect(creations).toBe(1)
    expect(db.created()).toBe(true)
  })

  it('in the chain: the teardown closes only what actually started', async () => {
    const events: string[] = []

    const chain = () =>
      lunette()
        .use(async (_ctx, next) => {
          const db = lazy(() => {
            events.push('open')
            return { end: () => events.push('close') }
          })
          try {
            return await next({ db })
          } finally {
            if (db.created()) db().end()
          }
        })
        .expose(({ db }) => ({ reports: { run: () => (db(), 'ok') } }))

    // nobody uses the db: no connection, no closing
    events.length = 0
    await chain().run(async () => {})
    expect(events).toEqual([])

    // somebody uses it: opens on the first call, closes at teardown
    events.length = 0
    await chain().run(async (pub) => {
      expect(pub.reports.run()).toBe('ok')
    })
    expect(events).toEqual(['open', 'close'])
  })

  it('lazyAsync: concurrent callers share the in-flight attempt', async () => {
    let attempts = 0
    const client = lazyAsync(async () => {
      attempts += 1
      return { connected: true }
    })

    const [a, b] = await Promise.all([client(), client()])
    expect(a).toBe(b)
    expect(attempts).toBe(1)
  })

  it('lazyAsync: a failure clears the cache and allows a retry', async () => {
    let attempts = 0
    const client = lazyAsync(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network down')
      return { connected: true }
    })

    await expect(client()).rejects.toThrow('network down')
    await expect(client()).resolves.toEqual({ connected: true })
    expect(attempts).toBe(2)
  })
})

describe('circular — the escape hatch for legacy cycles', () => {
  type ServiceB = { name: string; pingA: () => string }

  it('breaks the A↔B cycle by turning one side into a getter', async () => {
    const [getB, resolveB] = circular<ServiceB>()

    await lunette()
      .provide(() => ({
        a: { name: 'A', pingB: () => getB().name }, // A is born BEFORE B
      }))
      .provide(({ a }) => ({
        b: resolveB({ name: 'B', pingA: () => a.name }),
      }))
      .expose(({ a, b }) => ({
        probe: { ab: () => a.pingB(), ba: () => b.pingA() },
      }))
      .run(async (pub) => {
        expect(pub.probe.ab()).toBe('B') // A → B works
        expect(pub.probe.ba()).toBe('A') // B → A works
      })
  })

  it('using the getter during construction fails with a clear message', () => {
    const [getB] = circular<ServiceB>()

    expect(() => getB()).toThrow(/not resolved yet/)
  })
})
