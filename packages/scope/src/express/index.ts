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

import type { NextFunction, Request, Response } from 'express'
import type { ParamsDictionary, RouteParameters } from 'express-serve-static-core'
import type { Scope, State } from '../index.ts'

// `Params` is what the ROUTE PATTERN says the URL carries. It defaults to
// Express's own wide dictionary, which is what a middleware gets: it has no
// pattern to read.
export interface ExpressCarrier<Params = ParamsDictionary> {
  readonly __args?: {
    readonly req: Request<Params>
    readonly res: Response
    readonly next?: NextFunction
  }
}

// PURE DECLARATION — no runtime value at all. This is the pattern-less one,
// which `mw` runs on; `route` hands out a carrier typed by its own pattern.
export const expressCarrier: ExpressCarrier = {}

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

export const express = <App extends object>(deps: App) => ({
  // THE PATTERN IS WRITTEN ONCE. `route` takes it, hands back the pair Express
  // itself wants — `app.get(...route(…))` — and in between builds the scope on
  // a carrier typed BY that pattern, so `req.params.id` is `string` with no
  // cast and a param the route does not declare is a compile error.
  //
  // Which is why the scope arrives as a FUNCTION of the carrier rather than as
  // a value: a step is checked against `Ctx<S>` when it is ADDED, so a pattern
  // supplied after the chain was built would arrive too late to type anything.
  //
  // `RouteParameters` is Express's own reader — it understands `*path` and
  // `{/:id}`, which a parser of ours would have to bail on — and on a pattern
  // it cannot read (a non-literal `string`) it yields the wide dictionary, so
  // the types stop claiming to know rather than claiming wrongly.
  route: <Path extends string>(
    path: Path,
    build: (
      carrier: ExpressCarrier<RouteParameters<Path>>,
    ) => (
      app: App,
      args: {
        readonly req: Request<RouteParameters<Path>>
        readonly res: Response
      },
    ) => unknown,
  ): [Path, (req: Request, res: Response) => void] => {
    const sc = build({})
    return [
      path,
      (req, res) => {
        void sc(deps, { req: req as Request<RouteParameters<Path>>, res })
      },
    ]
  },

  // Express has no middleware the scope could return a value TO: a middleware
  // either answers on `res` or calls `next()`. So `mw` appends `toNext` as the
  // leaf, and a step that stops simply never reaches it.
  //
  // No pattern here, and none to take: `app.use(…)` mounts across routes, so
  // its params are the wide dictionary — which is what `expressCarrier` is.
  mw:
    <S extends State>(sc: Scope<S>) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
        app: App,
        args: unknown,
      ) => unknown
      void finished(deps, { req, res, next })
    },
})
