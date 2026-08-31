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

// The failure path. A rejected promise is not nullish, so a memo that kept it
// would make one transient failure permanent — and on a LAZY build, where the
// first attempt is a request rather than startup, that is every request after
// the first unlucky one, until the process or isolate is replaced.
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
      .use(async (_ctx, next) => {
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

  it('disposes while a build is IN FLIGHT that then fails', async () => {
    // The only path `dispose`'s own catch serves. Sequentially it is unreachable:
    // a failed build has already cleared the memo, so `dispose` returns at the
    // empty check. Here the handle is still pending when teardown starts — a
    // process shutting down while a connection times out — and awaiting it would
    // rethrow the build's rejection out of `dispose`.
    let release!: (fail: Error) => void
    const gate = new Promise<never>((_, reject) => {
      release = reject
    })
    const chain = lunette<{ env: Env }>()
      .use(async (_ctx, next) => {
        await gate
        return next({ db: { url: 'unreachable' } })
      })
      .expose((ctx) => ({ api: { url: () => ctx.db.url } }))
    const once = buildOnce(chain)

    const building = once.ensure(seedOf('pg://in-flight'))
    const tearing = once.dispose()
    release(new Error('transient: connection timed out'))

    await expect(building).rejects.toThrow('transient')
    await expect(tearing).resolves.toBeUndefined()
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

    // The thunk throws before the assignment, so nothing is ever memoized. Both
    // failure kinds are therefore retryable — this one by construction, a
    // rejected build because the memo drops it. Characterisation, not a guard:
    // this path holds either way.
    expect(attempts).toEqual(['pg://after-a-bad-seed'])
    expect(recovered.app.api.url()).toBe('pg://after-a-bad-seed')
    await once.dispose()
  })
})

// The handle's lifecycle ends at `dispose`. Before this, none of these threw:
// the memo outlived its own teardown, so `ensure` handed back an app whose
// layers had already run their `finally` — an object that still answers, on
// resources that are closed. The failure surfaced wherever the app next touched
// one, never at the call that asked for it (§38).
describe('buildOnce after dispose', () => {
  it('refuses to hand the app back — the one it built runs on closed resources', async () => {
    const { chain, built, torn } = counted()
    const once = buildOnce(chain)

    await once.ensure(seedOf('pg://ended'))
    await once.dispose()

    expect(() => once.ensure(seedOf('pg://ended'))).toThrow('was disposed')
    // Neither re-armed nor rebuilt: a second app is a second `buildOnce`.
    expect(built).toEqual(['pg://ended'])
    expect(torn).toEqual(['pg://ended'])
  })

  it('refuses a FIRST ensure too — the handle is spent, not merely emptied', async () => {
    const { chain, built } = counted()
    const once = buildOnce(chain)

    await once.dispose()

    expect(() => once.ensure(seedOf('pg://never'))).toThrow('was disposed')
    expect(built).toEqual([])
  })

  it('makes the second dispose a refusal instead of a silent repeat', async () => {
    const { chain, torn } = counted()
    const once = buildOnce(chain)
    const handle = await once.ensure(seedOf('pg://twice'))
    let calls = 0
    const chainDispose = handle.dispose.bind(handle)
    handle.dispose = () => {
      calls += 1
      return chainDispose()
    }

    await once.dispose()
    await once.dispose()

    // The chain absorbs a repeated teardown, which is exactly why the second
    // call used to reach it and leave no trace.
    expect(calls).toBe(1)
    expect(torn).toEqual(['pg://twice'])
  })

  it('tears down a build still IN FLIGHT and refuses it to the caller waiting', async () => {
    let open!: () => void
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const built: string[] = []
    const torn: string[] = []
    const chain = lunette<{ env: Env }>()
      .use(async (ctx, next) => {
        await gate
        built.push(ctx.env.DATABASE_URL)
        try {
          return await next({ db: { url: ctx.env.DATABASE_URL } })
        } finally {
          torn.push(ctx.env.DATABASE_URL)
        }
      })
      .expose((ctx) => ({ api: { url: () => ctx.db.url } }))
    const once = buildOnce(chain)

    const waiting = once.ensure(seedOf('pg://in-flight'))
    const tearing = once.dispose()
    open()

    // The app is built and torn down — teardown must reach a handle that did
    // not exist yet when it was asked for — and the caller gets the refusal
    // rather than an app that is already closed.
    await expect(waiting).rejects.toThrow('was disposed')
    await expect(tearing).resolves.toBeUndefined()
    expect(built).toEqual(['pg://in-flight'])
    expect(torn).toEqual(['pg://in-flight'])
  })
})

// The two costs of handing callers a promise DERIVED from the build, rather
// than the build itself (§38).
describe('buildOnce teardown, as something callers observe', () => {
  it('reports a FAILED teardown to the second caller too', async () => {
    let closes = 0
    const chain = lunette<{ env: Env }>()
      .use(async (ctx, next) => {
        try {
          return await next({ db: { url: ctx.env.DATABASE_URL } })
        } finally {
          closes += 1
          throw new Error('close failed: socket busy')
        }
      })
      .expose((ctx) => ({ api: { url: () => ctx.db.url } }))
    const once = buildOnce(chain)
    await once.ensure(seedOf('pg://stuck'))

    // Two shutdown paths — a `finally` and a signal handler, say — must not
    // disagree about whether the app closed. Memoizing the teardown is what
    // makes the repeat report the first one's outcome instead of "handled".
    await expect(once.dispose()).rejects.toThrow('close failed')
    await expect(once.dispose()).rejects.toThrow('close failed')
    // Reported twice, attempted once.
    expect(closes).toBe(1)
  })

  it('does not turn an unawaited ensure into an unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const { chain } = counted()
      const once = buildOnce(chain)

      // A warm-up nobody awaits, racing shutdown. `dispose` only ever attaches
      // a handler to the RAW build, so without one of its own the refusal
      // `delivered` carries would reach Node's default — which ends the process.
      void once.ensure(seedOf('pg://floating'))
      await once.dispose()
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
