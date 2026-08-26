import type { PubOf } from '@lntt/wire'
import { Hono } from 'hono'
import expressApp, { type Express } from 'express'
import { describe, it } from 'vitest'
import { chain, type Env } from './fixture/chain.ts'
import { courseHandler } from './fixture/handlers.ts'
import { scope } from '@lntt/scope'
import { express as expressPack } from '../src/express.ts'
import { hono, type WireEnv } from '../src/hono.ts'
import { reactRouter } from '../src/react-router.ts'

type Pub = PubOf<typeof chain>

const rr = reactRouter(chain, (env) => ({ env: env as Env }))
const ho = hono(chain, () => ({ env: {} as Env }))
const ex = expressPack(chain, () => ({ env: {} as Env }))

// A scope requiring a repo the chain's Pub does NOT expose — the deps axis.
// Param-less, so its schema is the unit schema (P = {}).
const needsBilling = scope()
  .guard((app: { billingRepo: { charge(): void } }, _ctx) => {
    app.billingRepo.charge()
    return { charged: true }
  })
  .handle((_deps: {}, ctx) => ({ charged: ctx.charged }))

// The deps axis (Need ⊆ Pub) is the ONE compile-time reconciliation that
// survives across every host. Params are NO LONGER reconciled per-adapter
// against a per-guard annotation: one `.input(schema)` fixes P, each host
// validates it NATIVELY (Hono `sValidator`, tRPC `.input`) or at runtime
// (RR7/Express/bus `runScope` → returned 422). Express is per-handler
// (`app.get(path, w.handler(frag))`) with NO path check — params are validated
// at runtime, so DIFFERENT chains can serve routes in the same Express app.
describe('adapter contract — deps by brand (Need ⊆ Pub) at each call site', () => {
  it('RR7: deps-vs-Pub is checked at toLoader (missing dep = compile error)', () => {
    // courseHandler's Need (session/admin/course repos) ⊆ Pub → accepted
    rr.toLoader(courseHandler)
    // needsBilling requires billingRepo, absent from Pub → DepGuard brand bites
    // @ts-expect-error — chain Pub is missing the scope's required deps
    rr.toLoader(needsBilling)
  })

  it('Hono: deps-vs-Pub is checked at handler, before the native chain', () => {
    const app = new Hono<WireEnv<Pub>>().use(ho.mount())
    // matching deps → the tuple spreads into Hono's native `.get`
    app.get('/courses/:courseId', ...ho.handler(courseHandler))
    // missing dep is caught at `wire`, independent of the terminal's RPC I
    // @ts-expect-error — chain Pub is missing the scope's required deps
    ho.handler(needsBilling)
  })

  it('Express: deps-vs-Pub is checked per handler; params validated at runtime', () => {
    const app: Express = expressApp()
    // per-handler: matching deps → a plain RequestHandler for a native route.
    // There is NO compile-time path check — params are validated at runtime by
    // `runScope` (a bad/missing param → a returned 422).
    app.get('/courses/:courseId', ex.handler(courseHandler))
    // missing dep is caught at `handler`, independent of the route path
    // @ts-expect-error — chain Pub is missing the scope's required deps
    ex.handler(needsBilling)
  })
})
