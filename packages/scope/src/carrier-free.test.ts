import { describe, expect, it } from 'vitest'
import expressLib from 'express'
import request from 'supertest'
import { Hono } from 'hono'
import { initTRPC } from '@trpc/server'
import { scope, type Next } from './index.ts'
import { express } from './express/index.ts'
import { hono } from './hono/index.ts'
import { reactRouter } from './react-router/index.ts'
import { trpc } from './trpc/index.ts'

// A SCOPE WITH NO CARRIER MOUNTS ON EVERY HOST — the one portable shape there
// is, and the only file that names all four mounts at once, which is why it is
// its own rather than part of `contract.test.ts` (the core names no host).
//
// The claim has two halves and both have to run: the same VALUE reaches all
// four mounts (a type-only test would say nothing about the four leaves that
// copy what the steps derived), and what it derives arrives in each host's own
// place — `res.locals`, `c.set`, tRPC's context override, the loader's return.
//
// It is what the mounts' carrier gate leaves open BY CONSTRUCTION rather than
// by exception: a scope started on no carrier reads `{}`, every mount brings at
// least that, and a superset passes — the verdict `DepGuard` gives the chain
// and `PathGate` gives the params, on the third axis.
//
// WHAT TRAVELS IS WHAT A STEP DERIVES, NOT WHEN ITS CODE RUNS. The unit that
// moves between hosts is really the STEP — a plain function reading no ctx goes
// into an Express scope and a Hono one unchanged — and there is exactly one
// thing it cannot carry across: a step that acts AFTER `next` runs before the
// downstream handler on Express and after it on Hono and tRPC, because
// Express's `next` hands back nothing to wait on. Stated on `toNext` in
// `express/index.ts` and pinned both ways in the two `index.test.ts` files.
//
// WHAT SUCH A SCOPE CAN DO is bounded by what it can see: the deps it was
// curried with, and what the steps before it populated. NOT the request — a
// guard reading a header has to name a carrier, and from there it belongs to
// one host. The four share no arg name (`req`/`res`, `c`, `input`/`ctx`,
// `request`/`params`), so there is no partly-portable middle: a scope reads
// nothing of the run, or it reads one host's.
const stamp = scope().step(
  async ({ rid }: { readonly rid: string }, _ctx, next: Next<{ rid: string }>) => next({ rid }),
)

const deps = { rid: 'r-1' }

describe('one scope with no carrier, mounted on all four hosts', () => {
  it('Express: what it derived is on `res.locals`', async () => {
    const app = expressLib()
    app.use(express(deps).mw(stamp))
    app.get('/', (_req, res) => res.json({ rid: res.locals.rid }))

    expect((await request(app).get('/')).body).toEqual({ rid: 'r-1' })
  })

  it('Hono: what it derived was `c.set`', async () => {
    const app = new Hono()
    app.use(hono(deps).mw(stamp))
    app.get('/', (c) => c.json({ rid: c.get('rid' as never) }))

    expect(await (await app.request('/')).json()).toEqual({ rid: 'r-1' })
  })

  it('tRPC: what it derived became the context override', async () => {
    const t = initTRPC.context<{ readonly tenant: string }>().create()
    const stamped = t.middleware(trpc(t, deps).middleware(stamp))

    const router = t.router({
      who: t.procedure.use(stamped).query(({ ctx }) => (ctx as { readonly rid: string }).rid),
    })

    expect(await router.createCaller({ tenant: 't1' }).who()).toBe('r-1')
  })

  it('React Router: there is no middleware, so the leaf hands it back', async () => {
    // The one host with no `mw` — a loader runs to completion on its own — so
    // the portable scope ends on a leaf instead of being decorated onto one.
    const loader = reactRouter(deps).loader(
      scope().step(async ({ rid }: { readonly rid: string }) => ({ rid })),
    )

    expect(await loader({} as never)).toEqual({ rid: 'r-1' })
  })
})
