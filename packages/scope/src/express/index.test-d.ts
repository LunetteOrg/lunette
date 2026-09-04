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

  it('IS BLIND to Express 5\'s optional group: `{/:id}` reads as a required `id`', () => {
    // `RouteParameters` — Express's own reader, and the reason there is no
    // parser of ours — reports `{/:id}` as a plain required `id`, so the gate
    // accepts this. The route matches `/posts` all the same and the step then
    // reads `req.params.id` as `undefined` against a type that says `string`.
    // Closing it means writing the reader this gate exists NOT to write; the
    // gate catches the misspelt and the missing param, and says so here rather
    // than being read as a claim it does not make.
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

describe('the mounts owe the scope its chain: `DepGuard` rides every mount', () => {
  // The deps are curried at `express({})`, so an empty chain reaches the scope
  // — and a scope demanding a `db` must be refused HERE, at the mount, exactly
  // as a direct call is. Left ungated, the mount would be the one door into a
  // scope that asks for more than it is handed, and the step would destructure
  // `db` off `{}` on the first request instead.
  const needsDb = scope(expressCarrier()).step(async ({ db }: { readonly db: string }, { res }) =>
    res.json({ db }),
  )

  it('refuses a scope the curried chain does not satisfy', () => {
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    route(needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    route('/', needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    mw(needsDb)
  })

  it('accepts it on a chain that does — a superset passes, as everywhere', () => {
    const withDb = express({ db: 'pg', extra: 1 })
    withDb.route(needsDb)
    withDb.route('/', needsDb)
    withDb.mw(needsDb)
  })
})
