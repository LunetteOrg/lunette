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
