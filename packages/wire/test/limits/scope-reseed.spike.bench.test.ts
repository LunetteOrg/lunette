// Scope-runtime re-seed RUNTIME probe (issue #30) — the recorded evidence
// behind the runtime figure in docs/design/scope-runtime.md: the wall-clock
// cost of building+running a scope chain (seeded with the whole app Pub)
// once per invocation. Retire once the strong-typed scope kit ships with
// its own perf test.
import { describe, it } from 'vitest'
import { lunette } from '../../src/index.ts'

interface Env {
  url: string
}

const appChain = lunette<{ env: Env }>()
  .expose((c) => ({ config: { db: c.env.url } }))
  .expose((c) => ({ pool: { q: c.config.db } }))
  .expose(() => ({ logger: { info: (m: string) => m } }))
  .expose((c) => ({ clock: { now: () => c.pool.q.length } }))
  .expose((c) => ({ userRepo: { find: (id: string) => `${c.config.db}:${id}` } }))
  .expose((c) => ({ sessionRepo: { get: (id: string) => c.userRepo.find(id) } }))
  .expose((c) => ({ adminRepo: { byId: (id: string) => c.sessionRepo.get(id) } }))
  .expose((c) => ({ courseRepo: { list: () => [c.adminRepo.byId('a')] } }))
  .expose((c) => ({ orderRepo: { count: () => c.courseRepo.list().length } }))
  .expose((c) => ({ mailer: { send: (to: string) => c.logger.info(to) } }))
  .expose((c) => ({ billing: { charge: (n: number) => n + c.orderRepo.count() } }))
  .expose((c) => ({ cache: { key: (k: string) => `${k}:${c.clock.now()}` } }))
  .expose((c) => ({ search: { q: (t: string) => c.cache.key(t) } }))
  .expose((c) => ({ metrics: { inc: (m: string) => c.search.q(m) } }))
  .expose((c) => ({ health: { ok: () => c.metrics.inc('ping') } }))

describe('scope-reseed runtime spike', () => {
  it('measures build+run of a scope chain per invocation', async () => {
    const { app, dispose } = await appChain.build({ env: { url: 'db://x' } })

    // one scope chain shape, re-seeded with the full app Pub each invocation
    const handle = (inv: { scope: { params: { id: string } } }) =>
      lunette<typeof app & typeof inv>()
        .expose((c) => ({ session: c.sessionRepo.get(inv.scope.params.id) }))
        .expose((c) => ({ admin: c.adminRepo.byId(c.session) + c.orderRepo.count() }))
        .run({ ...app, ...inv }, async (deps) => deps.admin)

    const N = 20_000
    // warmup
    for (let i = 0; i < 1_000; i++) await handle({ scope: { params: { id: `w${i}` } } })

    const t0 = performance.now()
    for (let i = 0; i < N; i++) await handle({ scope: { params: { id: `u${i}` } } })
    const t1 = performance.now()

    await dispose()
    const perInvocation = (t1 - t0) / N
    // eslint-disable-next-line no-console
    console.log(
      `[spike] ${N} invocations in ${(t1 - t0).toFixed(0)}ms → ${(perInvocation * 1000).toFixed(1)}µs/invocation`,
    )
  })
})
