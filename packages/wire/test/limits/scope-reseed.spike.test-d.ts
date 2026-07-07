// Scope-runtime re-seed perf probe (issue #30) — the recorded evidence
// behind the perf verdict in docs/design/scope-runtime.md. Each route is a
// scope chain seeded with the *inferred* app Pub (App & Invocation); the
// type-level cost of re-seeding was swept over K routes (K = 0/10/20/40)
// with `tsc --extendedDiagnostics`. This committed instance is a
// representative K; the full curve lives in the doc. Retire once the
// strong-typed scope kit ships with its own perf test.
import { describe, it } from 'vitest'
import { Lunette, lunette } from '../../src/index.ts'

type PubOf<C> = C extends Lunette<any, infer P, any> ? P : never

interface Env {
  url: string
}

// The build-tier app: a ~15-layer chain. Its Pub is an inferred accumulated
// intersection — exactly the type the scope chain must re-seed.
const appChain = lunette<{ env: Env }>()
  .expose((c) => ({ config: { db: c.env.url } }))
  .expose((c) => ({ pool: { q: c.config.db } }))
  .expose((c) => ({ logger: { info: (m: string) => m } }))
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

type App = PubOf<typeof appChain>

// The per-invocation seed added on top of the whole App.
interface Invocation {
  scope: { request: Request; params: Record<string, string> }
}

// route 0: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route0(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session0: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin0: c.adminRepo.byId(c.session0) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r0: deps.admin0 }))
}

// route 1: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route1(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session1: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin1: c.adminRepo.byId(c.session1) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r1: deps.admin1 }))
}

// route 2: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route2(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session2: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin2: c.adminRepo.byId(c.session2) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r2: deps.admin2 }))
}

// route 3: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route3(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session3: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin3: c.adminRepo.byId(c.session3) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r3: deps.admin3 }))
}

// route 4: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route4(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session4: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin4: c.adminRepo.byId(c.session4) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r4: deps.admin4 }))
}

// route 5: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route5(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session5: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin5: c.adminRepo.byId(c.session5) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r5: deps.admin5 }))
}

// route 6: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route6(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session6: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin6: c.adminRepo.byId(c.session6) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r6: deps.admin6 }))
}

// route 7: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route7(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session7: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin7: c.adminRepo.byId(c.session7) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r7: deps.admin7 }))
}

// route 8: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route8(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session8: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin8: c.adminRepo.byId(c.session8) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r8: deps.admin8 }))
}

// route 9: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route9(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session9: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin9: c.adminRepo.byId(c.session9) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r9: deps.admin9 }))
}

// route 10: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route10(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session10: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin10: c.adminRepo.byId(c.session10) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r10: deps.admin10 }))
}

// route 11: a scope chain seeded with App & Invocation, two guards
// enriching deps (exposed so the leaf sees them), reading app singletons
// from ctx (the re-seed), then a leaf.
async function route11(app: App, inv: Invocation) {
  return lunette<App & Invocation>()
    .expose((c) => ({ session11: c.sessionRepo.get(inv.scope.params.id ?? 'x') }))
    .expose((c) => ({ admin11: c.adminRepo.byId(c.session11) + c.orderRepo.count() }))
    .run({ ...app, ...inv }, async (deps) => ({ r11: deps.admin11 }))
}

describe('scope-reseed spike', () => {
  it('type-checks 12 routes re-seeding the full Pub', async () => {
    void route0
    void route1
    void route2
    void route3
    void route4
    void route5
    void route6
    void route7
    void route8
    void route9
    void route10
    void route11
  })
})
