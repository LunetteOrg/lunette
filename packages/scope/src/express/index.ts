// `@lntt/scope/express` — the Express carrier and its mounts.
//
// A carrier is `__args` alone (§43): the shape of a run's second argument, and
// nothing coined. There is no vocabulary to render, so what a subpath ships
// besides the declaration is what Express needs to MOUNT a scope — which is why
// there is no separate adapter package between the two.
//
// Express hands a route `(req, res)` and a middleware `(req, res, next)`. Both
// are here, and neither reads the ctx: what a step reads it ANNOTATES, and the
// carrier either publishes it or the step is refused at the argument by
// contravariance.

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary, RouteParameters } from 'express-serve-static-core'
import type { Scope, State } from '../index.ts'

// `Params` is what the scope says the URL carries. It defaults to Express's own
// wide dictionary — a scope that names nothing reads `string | undefined` and
// mounts anywhere.
export interface ExpressCarrier<Params = ParamsDictionary> {
  readonly __args?: {
    readonly req: Request<Params>
    readonly res: Response
    readonly next?: NextFunction
  }
}

// PURE DECLARATION — the returned object carries nothing; the type argument is
// the whole point of the call. `expressCarrier()` reads the wide dictionary;
// `expressCarrier<{ id: string }>()` says which params the scope reads, and
// `route(path, …)` can then check a pattern against it.
export const expressCarrier = <Params = ParamsDictionary>(): ExpressCarrier<Params> => ({})

// Whatever a middleware's steps derive lands on `res.locals` before Express's
// own `next()` runs — the leaf every `mw()` chain ends on, appended by `mw`
// itself so nobody has to remember to write it.
//
// `req` is destructured out and discarded with the rest of the carrier's own
// args: what belongs on `res.locals` is what the STEPS populated, not what the
// run was handed.
const toNext = async (
  _app: {},
  ctx: {
    readonly res: Response
    readonly next?: NextFunction
    readonly req?: Request
  } & Record<string, unknown>,
) => {
  const { res, next, req, ...derived } = ctx
  void req
  Object.assign(res.locals, derived)
  next?.()
  return undefined
}

// ── the route gate: what the scope READS against what the pattern SUPPLIES ───
// WE WRITE NO PARSER. `RouteParameters` is Express's own reader, so this cannot
// drift from the router that matches paths at runtime — it understands `*path`
// and `{/:id}`, cases a parser of ours would have to bail on.
declare const OPAQUE: unique symbol
type Opaque = typeof OPAQUE

// A NON-LITERAL pattern resolves to `ParamsDictionary`, whose `keyof` is the
// wide `string`. That must read as "cannot read this pattern", never as "every
// name is missing": catching less is fine, rejecting a valid route is not.
type Supplied<Path extends string> = string extends keyof RouteParameters<Path>
  ? Opaque
  : keyof RouteParameters<Path>

// ONE DIRECTION, and which one is the point. The scope DEMANDS — it reads
// `req.params.id` — and the route SUPPLIES. A param the scope reads and the
// pattern does not supply is `undefined` at runtime; a param the pattern
// supplies and nobody reads is nothing at all, which is the same verdict
// `DepGuard` gives the chain (a superset passes) and what lets one scope mount
// under a nested route.
//
// The test is REVERSED on purpose: a param-less pattern's real key set is
// `never`, and `never extends Opaque` is VACUOUSLY TRUE — written the natural
// way round, the gate would silently skip every param-less route.
// The same reading on the DEMAND side: a scope started on the bare
// `expressCarrier()` holds Express's wide dictionary, whose `keyof` is `string`
// — which says "names nothing", not "reads every possible name". Without this
// such a scope would be refused by every pattern.
type Demanded<Par> = string extends keyof Par ? never : keyof Par

type Unsupplied<Path extends string, Par> = Opaque extends Supplied<Path>
  ? never
  : Exclude<Demanded<Par>, Supplied<Path>>

type PathGate<Path extends string, Par> = [Unsupplied<Path, Par>] extends [never]
  ? unknown
  : `⛔ this route does not supply a param the scope reads: ${Unsupplied<Path, Par> & string}`

// What the scope says it reads, taken off the carrier it was started on.
type ParamsOf<S extends State> = S['args'] extends { readonly req: Request<infer P> } ? P : never

// What a middleware's steps populated — exactly what `toNext` copies onto
// `res.locals`, so the type and the runtime say the same thing.
type LocalsDerivedBy<S extends State> = S['acc'] extends Record<string, any>
  ? S['acc']
  : Record<string, any>

// THE MOUNTS ARE TRANSPARENT: each hands back the host's own type with what the
// scope knows filled in, rather than the widest thing that would compile.
//
//   a route     the PARAMS it declared, so `RequestHandler<{ id: string }>`
//   a middleware the LOCALS its steps derived, since `toNext` copies exactly
//                those onto `res.locals`
//
// Express accumulates neither across a router the way Hono's RPC schema does,
// so nothing downstream reads them on its own — but a handler written against
// one (`RequestHandler<P, any, any, ParsedQs, LocalsOf<typeof withActor>>`)
// then reads `res.locals.actor` typed, and the declaration stops being a lie.
export type LocalsOf<Mw> = Mw extends RequestHandler<any, any, any, any, infer L> ? L : never

export const express = <App extends object>(deps: App) => {
  const handlerFor =
    <S extends State>(sc: unknown): RequestHandler<ParamsOf<S>> =>
    (req, res) => {
      void (sc as (app: App, args: object) => unknown)(deps, { req, res })
    }

  return {
    // TWO FORMS, and the second is the first plus a check.
    //
    //   app.get('/posts/:id', route(scope))        the handler, nothing checked
    //   app.get(...route('/posts/:id', scope))     the pair, pattern checked
    //
    // The pattern cannot be checked in the one-argument form, and that is a
    // fact about Express rather than a choice: its `P = RouteParameters<Route>`
    // is a DEFAULT, used only where inference found no candidate, and a handler
    // we return always offers one — its own `req`. So a pattern reaches a type
    // of ours only by being an ARGUMENT to one (`research/route-gate` measures
    // this, and the seven shapes that do not work).
    route: (<Path extends string, S extends State>(
      a: Path | Scope<S>,
      b?: Scope<S> & PathGate<Path, ParamsOf<S>>,
    ) =>
      b === undefined
        ? handlerFor(a)
        : [a as Path, handlerFor(b)]) as {
      <S extends State>(sc: Scope<S>): RequestHandler<ParamsOf<S>>
      <Path extends string, S extends State>(
        path: Path,
        // The gate rides the SCOPE argument: intersected onto the path, a
        // failing gate collapses to `never` and the message is lost.
        sc: Scope<S> & PathGate<Path, ParamsOf<S>>,
      ): readonly [Path, RequestHandler<ParamsOf<S>>]
    },

    // Express has no middleware the scope could return a value TO: a middleware
    // either answers on `res` or calls `next()`. So `mw` appends `toNext` as the
    // leaf, and a step that stops simply never reaches it.
    //
    // No pattern here, and none to take: `app.use(…)` mounts across routes.
    mw:
      <S extends State>(
        sc: Scope<S>,
        // `Request['query']` rather than naming `ParsedQs`: that type lives in
        // `qs`, which is not a dependency here, and the query slot has to be
        // filled to reach the locals one.
      ): RequestHandler<ParamsDictionary, any, any, Request['query'], LocalsDerivedBy<S>> =>
      (req, res, next): void => {
        const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
          app: App,
          args: unknown,
        ) => unknown
        void finished(deps, { req, res, next })
      },
  }
}
