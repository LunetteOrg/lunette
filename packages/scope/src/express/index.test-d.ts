import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import type { Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import { express, expressCarrier, params, type LocalsOf } from './index.ts'
import { guards } from '../guard/index.ts'
import { z } from 'zod'
import { honoCarrier } from '../hono/index.ts'
import type { Next } from '../index.ts'

// THE TYPE CONTRACT for the two mounts and their gates. Every claim here is
// type-level, so no runtime test could make it.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error`.

const { route, handler, mw } = express({})

// The carrier declares no params (§53): `req.params` is Express's own wide
// dictionary on every scope, and what a route really carries is checked by
// `.step(params).validate('params', …)` instead, on the value.
//
// Read straight off `req` it is `string | string[] | undefined` — Express's own
// dictionary width, plus what `noUncheckedIndexedAccess` makes of an index
// signature — and every part of that union is a case the router really produces
// (a repeated param, a pattern that does not carry the name). The declaration
// used to narrow all three away on the strength of a NAME check alone: the
// narrowing §53 gave up, and `.validate('params', …)` is what earns it back,
// having actually looked at the value.
const byId = scope(expressCarrier()).step(async (_app: {}, { req, res }) => {
  expectTypeOf(req.params.id).toEqualTypeOf<string | string[] | undefined>()
  return res.json({ id: req.params.id })
})

describe('`route(path, scope)` and `handler(scope)`: one shape, two places to write the pattern', () => {
  it('mounts under any pattern — neither verb compares one, and nothing declares params', () => {
    expressLib().get(...route('/posts/:id', byId))
    expressLib().get(...route('/tenants/:tenant/posts/:id', byId))
    // wrong, and it compiles: what `:postId` supplies nobody named, and the
    // step reads `req.params.id` as `undefined` at runtime. The refusal that
    // catches THIS is `.validate('params', …)`'s, on the first request (§52) —
    // no longer a compile-time one, which is the trade §53 records.
    expressLib().get(...route('/posts/:postId', byId))
    expressLib().get('/posts/:postId', handler(byId))
  })

  it('has no opinion on a pattern it cannot read, as it never had', () => {
    const dynamic: string = '/posts/:id'
    route(dynamic, byId)
  })

  it('hands back the pattern as its literal, so the mount stays typed', () => {
    expectTypeOf(route('/posts/:id', byId)[0]).toEqualTypeOf<'/posts/:id'>()
  })
})

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

    scope(expressCarrier())
      .extend(guards)
      .step(params)
      .validate('params', z.object({ id: z.string() }), (issues, { res }) =>
        res.status(400).json({ issues }),
      )
      .step(async (_app: {}, { params: p, res }) => {
        // and here `id` is `string` because something LOOKED at it: this is
        // the narrowing §53 keeps, in exchange for the one it gave up
        expectTypeOf(p.id).toEqualTypeOf<string>()
        return res.json({ id: p.id })
      })
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
    // `mw` is where two message-gates still both apply: this scope derives
    // `res` (StripGate) AND hands back a value Express will never send
    // (AnswerGate). Intersected side by side their literals give `'⛔ A' & '⛔
    // B'`, which is `never`, and the error becomes "not assignable to parameter
    // of type 'never'" with nothing left to read. Chained, the outer link
    // answers — pinned because the shape that breaks it compiles just as well.
    //
    // The pair that found the invariant was AnswerGate + the route's own
    // PathGate (§44); with the pattern gate gone (§53) this is the pair that
    // remains, and the invariant is the same one.
    const unsendable = scope(expressCarrier())
      .step(async (_app: {}, _ctx, next: Next<{ res: string }>) => next({ res: 'mine' }))
      .step(async () => ({ ok: true }))

    // @ts-expect-error ⛔ answer on `res`
    mw(unsendable)
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
