// `@lntt/scope/express` — the Express carrier and its mount.
//
// A carrier is `__args` alone (§43): the shape of a run's second argument, and
// nothing coined. There is no vocabulary to render, so what a subpath ships
// besides the declaration is what Express needs to MOUNT a scope — which is why
// there is no separate adapter package between the two.
//
// Express hands a route `(req, res)` and a middleware `(req, res, next)`. Both
// are `route`/`mw` below, and neither reads the ctx: what a step reads it
// ANNOTATES, and the carrier either publishes it or the step is refused at the
// argument by contravariance.

import type { NextFunction, Request, Response } from 'express'
import type { Scope, State } from '../index.ts'

export interface ExpressCarrier {
  readonly __args?: { readonly req: Request; readonly res: Response; readonly next?: NextFunction }
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`.
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
  // `Args` is generic so a route can narrow what it receives — Express's
  // per-route params ride an INDEX SIGNATURE (`ParamsDictionary`), which
  // structurally satisfies a literal `{ id: string }`, so a step reading
  // `req.params.id` needs no widening here.
  route:
    <Args extends { readonly req: Request; readonly res: Response }>(
      sc: (app: App, args: Args) => unknown,
    ) =>
    (req: Request, res: Response): void => {
      void sc(deps, { req, res } as Args)
    },

  // Express has no middleware the scope could return a value TO: a middleware
  // either answers on `res` or calls `next()`. So `mw` appends `toNext` as the
  // leaf, and a step that stops simply never reaches it.
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
