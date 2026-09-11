import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '@lntt/scope'
import type { Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import { express, expressCarrier, params, type LocalsOf } from '@lntt/scope/express'
import { guards } from '@lntt/scope/guard'
import { z } from 'zod'
import { honoCarrier } from '@lntt/scope/hono'
import type { Next } from '@lntt/scope'

// THE TYPE CONTRACT for the two mounts and their gates. Every claim here is
// type-level, so no runtime test could make it.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error`.

const { route, handler, mw } = express({})

// The carrier declares no params: `req.params` is Express's own wide
// dictionary on every scope, and what a route really carries is checked by
// `.step(params).validate('params', …)` instead, on the value.
//
// Read straight off `req` it is `string | string[] | undefined` — Express's own
// dictionary width, plus what `noUncheckedIndexedAccess` makes of an index
// signature — and every part of that union is a case the router really produces
// (a repeated param, a pattern that does not carry the name). A declaration on
// the CARRIER would narrow all three away on the strength of a NAME check
// alone; `.validate('params', …)` earns the narrowing instead, having actually
// looked at the value.
const byId = scope(expressCarrier()).step(async (_app: {}, { req, res }) => {
  expectTypeOf(req.params.id).toEqualTypeOf<string | string[] | undefined>()
  return res.json({ id: req.params.id })
})

// A scope that says what the URL carries: it says it ONCE, in the schema, and
// that is what `route` compares a pattern against.
const withId = scope(expressCarrier())
  .extend(guards)
  .step(params)
  .validate('params', z.object({ id: z.string() }), (issues, { res }) =>
    res.status(400).json({ issues }),
  )
  .step(async (_app: {}, { params: p, res }) => res.json({ id: p.id }))

describe('what a scope reads of the URL: `params`, then `validate`', () => {
  it('starts WIDE and is narrowed by the schema, not by a declaration', () => {
    scope(expressCarrier())
      .extend(guards)
      .step(params)
      .step(async (_app: {}, { params: p }) => {
        // straight off the router, at Express's own width: no key is promised
        expectTypeOf(p).toEqualTypeOf<ParamsDictionary>()
        return undefined
      })

    // and after the schema `id` is `string` because something LOOKED at it:
    // a narrowing earned rather than asserted — and the SAME schema is what
    // `route` reads below.
    withId.step(async (_app: {}, { params: p }) => {
      expectTypeOf(p.id).toEqualTypeOf<string>()
      return undefined
    })
  })
})

describe('`route(path, scope)`: what the scope VALIDATES against what the route SUPPLIES', () => {
  it('accepts a pattern that supplies what the schema demands', () => {
    expressLib().get(...route('/posts/:id', withId))
  })

  it('rejects a pattern that supplies a different param — every request would 400', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope validates: id
    route('/posts/:postId', withId)
  })

  it('rejects a pattern that supplies none', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope validates: id
    route('/posts', withId)
  })

  it('ACCEPTS a route supplying more than the schema demands — a superset passes', () => {
    // the verdict `DepGuard` already gives the chain, applied to params: one
    // scope mounts under a nested route, or on a second pattern naming the
    // same. A param nobody validates is nothing at all — reading it goes
    // through `ctx.params`, which IS the schema.
    route('/tenants/:tenant/posts/:id', withId)
  })

  it('rejects an OPTIONAL supply for a required demand: `{/:id}` also matches `/posts`', () => {
    // Express's own reader carries this — an optional group builds as
    // `Partial<…>`, so this pattern's `id` is optional where `/posts/:id`'s is
    // not. Mounted here the route answers `/posts` too, and the schema, which
    // demands `id`, 400s on it.
    // @ts-expect-error ⛔ this route does not supply a param the scope validates: id
    route('/posts{/:id}', withId)
  })

  it('accepts either supply for an OPTIONAL demand — the schema already admits its absence', () => {
    const maybeById = scope(expressCarrier())
      .extend(guards)
      .step(params)
      .validate('params', z.object({ id: z.string().optional() }), (i, { res }) =>
        res.status(400).json({ i }),
      )
      .step(async (_app: {}, { params: p, res }) => res.json({ id: p.id ?? null }))

    route('/posts{/:id}', maybeById)
    route('/posts/:id', maybeById)
  })

  it('has NO OPINION on a pattern it cannot read', () => {
    const dynamic: string = '/posts/:id'
    route(dynamic, withId)
  })

  it('has NO OPINION on a scope that validates nothing — there is no demand to read', () => {
    // `byId` reads `req.params` by hand, so nothing declares what it wants and
    // the gate has nothing to compare. Its type says `string | string[] |
    // undefined` there, which is the honest width and what keeps this from
    // being silent.
    route('/posts/:postId', byId)
    route('/posts', byId)
  })

  it('hands back the pattern as its literal, so the mount stays typed', () => {
    expectTypeOf(route('/posts/:id', withId)[0]).toEqualTypeOf<'/posts/:id'>()
  })
})

describe('`handler(scope)`: the escape hatch, and the pattern is Express\'s', () => {
  it('mounts anywhere, including where `route` refuses — nothing compares the pattern', () => {
    // wrong, and it compiles: the pattern is Express's own argument here, so it
    // never reaches a type of ours. `.validate` still answers 400 on the first
    // request; what is lost is only the refusal at the mount.
    expressLib().get('/posts/:postId', handler(withId))
  })
})

describe('the mounts are transparent: each hands back Express\'s own type, filled in', () => {
  it('a route hands back Express\'s own handler, at the params width the router has', () => {
    expectTypeOf(handler(byId)).toEqualTypeOf<RequestHandler>()
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
    handler(needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    route('/', needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    mw(needsDb)
  })

  it('accepts it on a chain that does — a superset passes, as everywhere', () => {
    const withDb = express({ db: 'pg', extra: 1 })
    withDb.handler(needsDb)
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
    handler(returnsAValue)
    // @ts-expect-error ⛔ a route answers on `res`
    route('/', returnsAValue)
  })

  it('accepts a leaf that wrote the response and hands back nothing', () => {
    handler(
      scope(expressCarrier()).step(async (_app: {}, { res }) => {
        res.status(204).end()
        return undefined
      }),
    )
  })

  it('accepts a union of answers, which is what a guard plus a leaf builds', () => {
    handler(
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
    handler(
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
    handler(forHono)
    // @ts-expect-error — this scope reads `c`; an Express mount brings req/res
    route('/', forHono)
    // @ts-expect-error — this scope reads `c`; an Express mount brings req/res
    mw(forHono)
  })

  it('refuses a scope started on no host carrier at all', () => {
    const bare = scope<{ readonly tenant: string }>().step(async (_app: {}, { tenant }) => tenant)

    // @ts-expect-error — this scope reads `tenant`, which no Express run brings
    handler(bare)
  })
})

describe('two message-gates never meet on one argument', () => {
  it('answers with a message where intersecting them would collapse to `never`', () => {
    // THE PAIR THAT FOUND THE INVARIANT: both the answer gate and the
    // path gate fail here. Intersected side by side their literals give
    // `'⛔ A' & '⛔ B'`, which is `never`, and the error becomes "not assignable
    // to parameter of type 'never'" with nothing left to read. Chained, the
    // outer link answers — pinned because the shape that breaks it compiles
    // just as well.
    const unsendable = scope(expressCarrier())
      .extend(guards)
      .step(params)
      .validate('params', z.object({ id: z.string() }), (i, { res }) =>
        res.status(400).json({ i }),
      )
      .step(async () => ({ ok: true }))

    // @ts-expect-error ⛔ answer on `res`
    route('/posts', unsendable)
  })

  it('holds on `mw`\'s chain too, where the pair is a different one', () => {
    // `AnswerGate` chained onto `StripGate`: this scope derives `res` AND hands
    // back a value Express will never send. Same invariant, second chain — the
    // one the route pair does not cover.
    const both = scope(expressCarrier())
      .step(async (_app: {}, _ctx, next: Next<{ res: string }>) => next({ res: 'mine' }))
      .step(async () => ({ ok: true }))

    // @ts-expect-error ⛔ answer on `res`
    mw(both)
  })
})

describe('a middleware answers on `res` too, and worse when it does not', () => {
  it('refuses a guard that stops by returning a domain value', () => {
    // The error convention makes this the natural thing to write — a RETURNED
    // error is a domain value — and on `mw` it is worse than on a route: the
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
