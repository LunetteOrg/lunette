// `@lntt/scope/hono` — the Hono carrier and its mount.
//
// A carrier is `__args` alone (§43). Hono's whole request lives on one value,
// `c`, so that is what a run brings: `c.req` reads, `c.json`/`c.notFound`
// answer, and a step that answers returns Hono's own `Response`.

import type { Context, Next } from 'hono'
import type { Scope, State } from '../index.ts'

export interface HonoCarrier {
  readonly __args?: { readonly c: Context }
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`.
export const honoCarrier: HonoCarrier = {}

// Whatever a middleware's steps derive lands on `c` (via `c.set`) before Hono's
// own `next()` runs — the leaf every `mw()` chain ends on, appended by `mw`
// itself so nobody has to remember to write it.
//
// `c` and `next` are destructured out: what belongs on the context is what the
// STEPS populated, not what the run was handed.
const toNext = async (
  _app: {},
  ctx: { readonly c: Context; readonly next: Next } & Record<string, unknown>,
) => {
  const { c, next, ...derived } = ctx
  for (const [key, value] of Object.entries(derived)) c.set(key, value)
  await next()
  return undefined
}

export const hono = <App extends object>(deps: App) => ({
  // `Args` is generic so a route can narrow `c` to its own path —
  // `Context<Env, '/posts/:id'>` is what makes `c.req.param('id')` typed —
  // and a narrower `c` still satisfies the carrier's own.
  route:
    <Args extends { readonly c: Context }>(sc: (app: App, args: Args) => unknown) =>
    (c: Context): Promise<Response> =>
      sc(deps, { c } as Args) as Promise<Response>,

  // Hono's middleware is real — it awaits `next()` and can act after it — so
  // unlike Express's, `mw` returns a promise the host awaits.
  mw:
    <S extends State>(sc: Scope<S>) =>
    async (c: Context, next: Next): Promise<void> => {
      const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
        app: App,
        args: unknown,
      ) => unknown
      await finished(deps, { c, next })
    },
})
