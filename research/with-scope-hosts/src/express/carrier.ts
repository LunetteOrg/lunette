import type { NextFunction, Request, Response } from 'express'
import type { Scope, State } from '@lntt/scope'

export interface ExpressCarrier {
  readonly __args?: { readonly req: Request; readonly res: Response; readonly next?: NextFunction }
}

export const expressCarrier: ExpressCarrier = {}

// Whatever a middleware's steps derive lands on `res.locals` before Express's
// own `next()` runs — the leaf every `mw()` chain ends on, added here so
// nobody has to remember to append it.
const toNext = async (
  _app: {},
  ctx: { readonly res: Response; readonly next?: NextFunction; readonly req?: Request } & Record<string, unknown>,
) => {
  const { res, next, req, ...derived } = ctx
  void req
  Object.assign(res.locals, derived)
  next?.()
  return undefined
}

export const express = <App extends object>(deps: App) => ({
  route:
    <Args extends { readonly req: Request; readonly res: Response }>(
      sc: (app: App, args: Args) => unknown,
    ) =>
    (req: Request, res: Response): void => {
      void sc(deps, { req, res } as Args)
    },

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
