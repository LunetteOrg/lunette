import { Hono } from 'hono'
import expressApp, { type Express } from 'express'
import { describe, it } from 'vitest'
import { chain, type Env } from '../chain.ts'
import { courseHandler } from '../example.ts'
import { fragment } from '../scope/fragment.ts'
import { express as expressPack } from './express.ts'
import { hono, type WireEnv } from './hono.ts'
import { reactRouter } from './react-router.ts'

type Pub = Awaited<ReturnType<typeof chain.build>>['app']

const rr = reactRouter(chain, (env) => ({ env: env as Env }))
const ho = hono(chain, () => ({ env: {} as Env }))
const ex = expressPack(chain, () => ({ env: {} as Env }))

// A fragment requiring a repo the chain's Pub does NOT expose — the deps axis.
// Param-less, so its schema is the unit schema (P = {}).
const needsBilling = fragment()
  .guard((app: { billingRepo: { charge(): void } }, _p, _ctx) => {
    app.billingRepo.charge()
    return { charged: true }
  })
  .handle((deps) => ({ charged: deps.charged }))

// The deps axis (Need ⊆ Pub) is the ONE compile-time reconciliation that
// survives across every host. Params are NO LONGER reconciled per-adapter
// against a per-guard annotation: one `.input(schema)` fixes P, each host
// validates it NATIVELY (Hono `sValidator`, tRPC `.input`) or at runtime
// (RR7/Express/bus `runScope` → returned 422). Express alone keeps a typed-path
// KEY-PRESENCE check (its route param keys ⊇ the schema's required input keys).
describe('adapter contract — deps by brand (Need ⊆ Pub) at each call site', () => {
  it('RR7: deps-vs-Pub is checked at toLoader (missing dep = compile error)', () => {
    // courseHandler's Need (session/admin/course repos) ⊆ Pub → accepted
    rr.toLoader(courseHandler)
    // needsBilling requires billingRepo, absent from Pub → DepGuard brand bites
    // @ts-expect-error — chain Pub is missing the fragment's required deps
    rr.toLoader(needsBilling)
  })

  it('Hono: deps-vs-Pub is checked at wire, before the native chain', () => {
    const app = new Hono<WireEnv<Pub>>().use(ho.mount())
    // matching deps → the tuple spreads into Hono's native `.get`
    app.get('/courses/:courseId', ...ho.wire(courseHandler))
    // missing dep is caught at `wire`, independent of the terminal's RPC I
    // @ts-expect-error — chain Pub is missing the fragment's required deps
    ho.wire(needsBilling)
  })

  it('Express: the typed path reconciles route keys against required input keys', () => {
    const app: Express = expressApp()
    // parsed { courseId } ⊇ schema required keys { courseId } → accepted
    ex.route(app).get('/courses/:courseId', courseHandler)
    // parsed { wrongId } lacks the required input key { courseId }
    // @ts-expect-error — route params { wrongId } miss required input key courseId
    ex.route(app).get('/courses/:wrongId', courseHandler)
    // plain routing bypasses key reconciliation: a param-less frag fits any route
    const ping = fragment().handle(() => ({ pong: true }))
    ex.route(app).getPlain('/anything', ping)
  })
})
