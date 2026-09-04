import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import type { Request, RequestHandler, Response } from 'express'
import { express, expressCarrier, type LocalsOf } from './index.ts'
import { honoCarrier } from '../hono/index.ts'
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

  it('rejects an OPTIONAL supply for a required demand: `{/:id}` also matches `/posts`', () => {
    // Express's own reader already says it — an optional group builds as
    // `Partial<…>`, so this pattern's `id` is `string | undefined` where
    // `/posts/:id`'s is `string`. Mounted here the route answers `/posts` too,
    // and the step reads `undefined` against a type saying `string`.
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts{/:id}', byId)
  })

  it('accepts either supply for an OPTIONAL demand — the step already reads undefined', () => {
    const maybeById = scope(expressCarrier<{ id?: string }>()).step(async (_app: {}, { req, res }) => {
      expectTypeOf(req.params.id).toEqualTypeOf<string | undefined>()
      return res.json({ id: req.params.id ?? null })
    })

    route('/posts{/:id}', maybeById)
    route('/posts/:id', maybeById)
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

describe('a route ANSWERS on `res`, and the gate says so before the request does', () => {
  it('refuses a leaf that hands back a value Express will never send', () => {
    // Express ignores a handler's return, so this writes nothing and the
    // request never gets an answer. Nothing downstream reads the type either,
    // which is why the check is asked for here rather than falling out of the
    // mount's own return the way Hono's does.
    const returnsAValue = scope(expressCarrier()).step(async () => ({ ok: true }))

    // @ts-expect-error ⛔ a route answers on `res`
    route(returnsAValue)
    // @ts-expect-error ⛔ a route answers on `res`
    route('/', returnsAValue)
  })

  it('accepts a leaf that wrote the response and hands back nothing', () => {
    route(
      scope(expressCarrier()).step(async (_app: {}, { res }) => {
        res.status(204).end()
        return undefined
      }),
    )
  })

  it('accepts a union of answers, which is what a guard plus a leaf builds', () => {
    route(
      scope(expressCarrier())
        .step(async (_app: {}, { res }, next: Next<{ actor: string }>) =>
          res.headersSent ? res.status(401).json({}) : next({ actor: 'u1' }),
        )
        .step(async (_app: {}, { res }) => res.json({ ok: true })),
    )
  })
})

describe('a middleware may not derive a ctx key the run itself brought', () => {
  it('refuses it, because the leaf strips those by name — and `next` would hang the request', () => {
    const hijacks = scope(expressCarrier()).step(
      async (_app: {}, _ctx, next: Next<{ next: () => void }>) => next({ next: () => {} }),
    )

    // @ts-expect-error ⛔ this middleware derives a ctx key the run itself brought: next
    mw(hijacks)
  })

  it('refuses a derived `res` too, which would simply be dropped from res.locals', () => {
    const shadows = scope(expressCarrier()).step(
      async (_app: {}, _ctx, next: Next<{ res: string }>) => next({ res: 'mine' }),
    )

    // @ts-expect-error ⛔ this middleware derives a ctx key the run itself brought: res
    mw(shadows)
  })

  it('a ROUTE takes no such gate: it copies nothing out, so nothing is stripped', () => {
    route(
      scope(expressCarrier())
        .step(async (_app: {}, _ctx, next: Next<{ next: () => void }>) => next({ next: () => {} }))
        .step(async (_app: {}, { res }) => res.json({})),
    )
  })
})

describe('a mount takes a scope written for ITS carrier, and no other', () => {
  // NO GATE OF OURS: what the mount brings is a parameter the scope has to be
  // assignable to, and `strictFunctionTypes` refuses one demanding args that
  // never arrive. Mounted ungated, these compiled and died on the first
  // request, reading `c` off `{ req, res }`.
  const forHono = scope(honoCarrier()).step(async (_app: {}, { c }) => c.json({}))

  it('refuses a scope written for another host', () => {
    // @ts-expect-error — this scope reads `c`; an Express mount brings req/res
    route(forHono)
    // @ts-expect-error — this scope reads `c`; an Express mount brings req/res
    route('/', forHono)
    // @ts-expect-error — this scope reads `c`; an Express mount brings req/res
    mw(forHono)
  })

  it('refuses a scope started on no host carrier at all', () => {
    const bare = scope<{ readonly tenant: string }>().step(async (_app: {}, { tenant }) => tenant)

    // @ts-expect-error — this scope reads `tenant`, which no Express run brings
    route(bare)
  })
})

describe('two message-gates never meet on one argument', () => {
  it('answers with a message where intersecting them would collapse to `never`', () => {
    // Both the answer gate and the path gate fail here. Intersected side by
    // side their literals give `'⛔ A' & '⛔ B'`, which is `never`, and the
    // error becomes "not assignable to parameter of type 'never'" with nothing
    // left to read. Chained, the outer link answers — pinned because the shape
    // that breaks it compiles just as well.
    const unsendable = scope(expressCarrier<{ id: string }>()).step(async () => ({ ok: true }))

    // @ts-expect-error ⛔ a route answers on `res`
    route('/posts', unsendable)
  })
})

describe('a middleware answers on `res` too, and worse when it does not', () => {
  it('refuses a guard that stops by returning a domain value', () => {
    // The convention makes this the natural thing to write (§3: a RETURNED
    // error is a domain value), and on `mw` it is worse than on a route: the
    // fold never reaches `toNext`, so Express's `next` is never called and the
    // request hangs with no response at all.
    const returnsAnError = scope(expressCarrier()).step(
      async (_app: {}, _ctx, next: Next<{ actor: string }>) =>
        Math.random() > 0.5 ? ({ error: 'unauthorized' } as const) : next({ actor: 'u1' }),
    )

    // @ts-expect-error ⛔ answer on `res`
    mw(returnsAnError)
  })

  it('accepts the same guard answering on `res`', () => {
    mw(
      scope(expressCarrier()).step(async (_app: {}, { res }, next: Next<{ actor: string }>) =>
        Math.random() > 0.5 ? res.status(401).json({ error: 'unauthorized' }) : next({ actor: 'u1' }),
      ),
    )
  })
})
