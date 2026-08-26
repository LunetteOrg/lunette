import { describe, expect, it } from 'vitest'
import { lunette } from './chain.ts'
import { buildOnce } from './build-once.ts'

// A chain that records every construction and teardown, so "once" is a
// counted fact rather than a claim.
type Env = { readonly DATABASE_URL: string }

const counted = () => {
  const built: string[] = []
  const torn: string[] = []
  const chain = lunette<{ env: Env }>()
    .use(async (ctx, next) => {
      built.push(ctx.env.DATABASE_URL)
      try {
        return await next({ db: { url: ctx.env.DATABASE_URL } })
      } finally {
        torn.push(ctx.env.DATABASE_URL)
      }
    })
    .expose((ctx) => ({ api: { url: () => ctx.db.url } }))
  return { chain, built, torn }
}

const seedOf = (url: string) => () => ({ env: { DATABASE_URL: url } })

describe('buildOnce', () => {
  it('builds on the first ensure and hands the SAME app back after that', async () => {
    const { chain, built } = counted()
    const once = buildOnce(chain)

    const first = await once.ensure(seedOf('pg://one'))
    const second = await once.ensure(seedOf('pg://two'))

    expect(built).toEqual(['pg://one'])
    expect(second.app).toBe(first.app)
    expect(second.app.api.url()).toBe('pg://one')
    await once.dispose()
  })

  it('never evaluates the seed thunk again — the seed is process-static', async () => {
    const { chain } = counted()
    const once = buildOnce(chain)
    let seeded = 0
    const seed = () => {
      seeded += 1
      return { env: { DATABASE_URL: 'pg://static' } }
    }

    await once.ensure(seed)
    await once.ensure(seed)
    await once.ensure(seed)

    // The later seeds are not merely discarded: they are never computed. A host
    // that varies its seed per request is therefore ignored, by design — the
    // per-call axis is the window, not a second app.
    expect(seeded).toBe(1)
    await once.dispose()
  })

  it('shares ONE build between calls that race the first one', async () => {
    const { chain, built } = counted()
    const once = buildOnce(chain)

    // The reason the PROMISE is memoized and not the resolved app: without it
    // both callers would find nothing built and start their own chain.
    const [a, b, c] = await Promise.all([
      once.ensure(seedOf('pg://raced')),
      once.ensure(seedOf('pg://raced')),
      once.ensure(seedOf('pg://raced')),
    ])

    expect(built).toEqual(['pg://raced'])
    expect(b.app).toBe(a.app)
    expect(c.app).toBe(a.app)
    await once.dispose()
  })

  it('tears the chain down on dispose', async () => {
    const { chain, torn } = counted()
    const once = buildOnce(chain)

    await once.ensure(seedOf('pg://closing'))
    expect(torn).toEqual([])
    await once.dispose()
    expect(torn).toEqual(['pg://closing'])
  })

  it('disposes nothing when nothing was ever built', async () => {
    const { chain, built, torn } = counted()
    await expect(buildOnce(chain).dispose()).resolves.toBeUndefined()
    expect(built).toEqual([])
    expect(torn).toEqual([])
  })

  it('keeps separate memos per handle, which is how you get a second app', async () => {
    const { chain, built } = counted()

    const a = await buildOnce(chain).ensure(seedOf('pg://tenant-a'))
    const b = await buildOnce(chain).ensure(seedOf('pg://tenant-b'))

    expect(built).toEqual(['pg://tenant-a', 'pg://tenant-b'])
    expect(a.app.api.url()).toBe('pg://tenant-a')
    expect(b.app.api.url()).toBe('pg://tenant-b')
    await a.dispose()
    await b.dispose()
  })
})

// The failure path, which the memo used to make permanent. A rejected promise is
// not nullish, so `??=` kept it and every later request re-awaited the same
// rejection — on a LAZY build, where the first attempt is a request rather than
// startup, one transient blip poisoned the process or isolate until restart.
describe('buildOnce when the build fails', () => {
  // A chain whose layer fails a given number of times before succeeding, with
  // a resource opened BEFORE the failing point, so teardown is observable.
  const flaky = (failures: number) => {
    const attempts: string[] = []
    const torn: string[] = []
    let left = failures
    const chain = lunette<{ env: Env }>()
      .use(async (ctx, next) => {
        attempts.push(ctx.env.DATABASE_URL)
        try {
          return await next({ db: { url: ctx.env.DATABASE_URL } })
        } finally {
          torn.push(ctx.env.DATABASE_URL)
        }
      })
      .use(async (ctx, next) => {
        if (left-- > 0) throw new Error('transient: could not connect')
        return next({ ready: true as const })
      })
      .expose((ctx) => ({ api: { url: () => ctx.db.url } }))
    return { chain, attempts, torn }
  }

  it('does not cache the rejection — the next ensure builds again', async () => {
    const { chain, attempts } = flaky(1)
    const once = buildOnce(chain)

    await expect(once.ensure(seedOf('pg://flaky'))).rejects.toThrow('transient')
    const recovered = await once.ensure(seedOf('pg://flaky'))

    expect(attempts).toEqual(['pg://flaky', 'pg://flaky'])
    expect(recovered.app.api.url()).toBe('pg://flaky')
    await once.dispose()
  })

  it('unwinds what the failed attempt had opened, so retrying leaks nothing', async () => {
    const { chain, torn } = flaky(1)
    const once = buildOnce(chain)

    await expect(once.ensure(seedOf('pg://unwound'))).rejects.toThrow('transient')
    // The layer's `finally` ran on the way out: the retry starts from nothing.
    expect(torn).toEqual(['pg://unwound'])
    await once.ensure(seedOf('pg://unwound'))
    await once.dispose()
    expect(torn).toEqual(['pg://unwound', 'pg://unwound'])
  })

  it('still shares ONE failing build between callers racing it', async () => {
    const { chain, attempts } = flaky(1)
    const once = buildOnce(chain)

    const raced = await Promise.allSettled([
      once.ensure(seedOf('pg://raced')),
      once.ensure(seedOf('pg://raced')),
      once.ensure(seedOf('pg://raced')),
    ])

    // One attempt, three rejections: the memo still does its job while the build
    // is in flight. Only a caller arriving AFTER it settles starts a new one.
    expect(attempts).toEqual(['pg://raced'])
    expect(raced.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected'])
    await once.dispose()
  })

  it('disposes without throwing after a build that failed', async () => {
    const { chain } = flaky(1)
    const once = buildOnce(chain)

    await expect(once.ensure(seedOf('pg://doomed'))).rejects.toThrow('transient')
    // Teardown has to work in the state that calls for it. Awaiting the rejected
    // handle would rethrow, leaving a caller no way to close what did succeed.
    await expect(once.dispose()).resolves.toBeUndefined()
  })

  it('leaves a seed that throws SYNCHRONOUSLY retryable too', async () => {
    const { chain, attempts } = flaky(0)
    const once = buildOnce(chain)
    let bad = true
    const seed = () => {
      if (bad) {
        bad = false
        throw new Error('invalid environment')
      }
      return { env: { DATABASE_URL: 'pg://after-a-bad-seed' } }
    }

    expect(() => once.ensure(seed)).toThrow('invalid environment')
    const recovered = await once.ensure(seed)

    // The thunk throws before the assignment, so nothing was ever memoized. The
    // two failure kinds now behave the same way; they used not to.
    expect(attempts).toEqual(['pg://after-a-bad-seed'])
    expect(recovered.app.api.url()).toBe('pg://after-a-bad-seed')
    await once.dispose()
  })
})
