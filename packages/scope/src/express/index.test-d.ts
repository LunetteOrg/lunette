import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import type { Request, RequestHandler, Response } from 'express'
import { express, expressCarrier, type LocalsOf } from './index.ts'
import type { Next } from '../index.ts'

// THE TYPE CONTRACT for the params and the route gate. Both claims are
// type-level, so no runtime test could make them.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error`.

const { route, mw } = express({})

const byId = scope(expressCarrier<{ id: string }>()).step(async (_app: {}, { req, res }) => {
  expectTypeOf(req.params.id).toEqualTypeOf<string>()
  return res.json({ id: req.params.id })
})

// Nothing declared: the scope holds Express's own wide dictionary, so it names
// no param and mounts under any pattern (pinned below).
const wide = scope(expressCarrier()).step(async (_app: {}, { res }) => res.end())

describe('what a scope declares it reads', () => {
  it('types `req.params` by the carrier, with no annotation on the step', () => {
    // pinned by the `expectTypeOf` calls inside the two scopes above
    expectTypeOf(byId).toBeFunction()
  })
})

describe('`route(path, scope)`: what the scope READS against what the route SUPPLIES', () => {
  it('accepts a pattern that supplies what the scope reads', () => {
    expressLib().get(...route('/posts/:id', byId))
  })

  it('rejects a pattern that supplies a different param — the scope would read undefined', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts/:postId', byId)
  })

  it('rejects a pattern that supplies none', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts', byId)
  })

  it('ACCEPTS a route supplying more than the scope reads — a superset passes', () => {
    // the verdict `DepGuard` already gives the chain, applied to params: one
    // scope mounts under a nested route, or on a second pattern naming the same
    route('/tenants/:tenant/posts/:id', byId)
    route('/posts/:id', wide)
  })

  it('has NO OPINION on a pattern it cannot read', () => {
    const dynamic: string = '/posts/:id'
    route(dynamic, byId)
  })

  it('reads Express 5 syntax with Express\'s own reader: `{/:id}` supplies `id`', () => {
    route('/posts{/:id}', byId)
  })

  it('hands back the pattern as its literal, so the mount stays typed', () => {
    expectTypeOf(route('/posts/:id', byId)[0]).toEqualTypeOf<'/posts/:id'>()
  })
})

describe('`route(scope)`: the plain handler, with nothing checked', () => {
  it('is an Express handler, mountable anywhere', () => {
    // The pattern is Express's own argument here, so it never reaches a type of
    // ours and nothing compares it — including this, which is wrong and
    // compiles. `route(path, scope)` is the form that catches it.
    expressLib().get('/posts/:postId', route(byId))
  })
})

describe('the mounts are transparent: each hands back Express\'s own type, filled in', () => {
  it('a route declares the params the scope reads', () => {
    expectTypeOf(route(byId)).toEqualTypeOf<RequestHandler<{ id: string }>>()
  })

  it('a middleware declares the locals its steps derived — what `toNext` really copies', () => {
    const requireActor = async (
      _app: {},
      { req, res }: { readonly req: Request; readonly res: Response },
      next: Next<{ actor: string }>,
    ) => {
      const actor = req.header('x-actor-id')
      if (!actor) return res.status(401).json({})
      return next({ actor })
    }

    const withActor = mw(scope(expressCarrier()).step(requireActor))

    expectTypeOf<LocalsOf<typeof withActor>>().toEqualTypeOf<{ actor: string }>()

    // which is how a handler downstream reads them typed
    const handler: RequestHandler<
      {},
      unknown,
      unknown,
      Request['query'],
      LocalsOf<typeof withActor>
    > = (_req, res) => {
      expectTypeOf(res.locals.actor).toEqualTypeOf<string>()
      res.end()
    }
    void handler
  })
})
