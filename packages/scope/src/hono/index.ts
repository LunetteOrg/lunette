// `@lntt/scope/hono` — the Hono carrier and its mounts.
//
// A carrier is `__args` alone (§43). Hono's whole request lives on one value,
// `c`, so that is what a run brings: `c.req` reads, `c.json`/`c.notFound`
// answer, and a step that answers returns Hono's own `Response`.

import type { Context, Next } from 'hono'
import type { BlankEnv, Env } from 'hono/types'
import type { Scope, State } from '../index.ts'

// `Path` is the ROUTE PATTERN, which is what makes `c.req.param('id')` typed —
// Hono's own `Context<Env, Path>` does the reading, and there is no parser of
// ours anywhere. It defaults to the bare `string`, which is what a middleware
// gets: it has no pattern.
//
// `E` is the app's Hono environment (its bindings and variables). It is a type
// parameter rather than a fixed `BlankEnv` because a step annotating a richer
// `Context<MyEnv, …>` than the carrier publishes would be refused at the
// argument by contravariance — the env has to come in at the carrier or not at
// all.
export interface HonoCarrier<Path extends string = string, E extends Env = BlankEnv> {
  readonly __args?: { readonly c: Context<E, Path> }
}

// PURE DECLARATION — no runtime value at all. This is the pattern-less one,
// which `mw` runs on; `route` hands out a carrier typed by its own pattern.
export const honoCarrier: HonoCarrier = {}

// Whatever a middleware's steps derive lands on `c` (via `c.set`) before Hono's
// own `next()` runs — the leaf every `mw()` chain ends on, appended by `mw`
// itself so nobody has to remember to write it.
//
// `c` and `next` are destructured out: what belongs on the context is what the
// STEPS populated, not what the run was handed.
// `Context<any>` here, and only here: what a middleware's steps populate are
// keys no `Env['Variables']` declares — `c.set` on a typed env accepts only the
// names that env wrote down, and these are the run's own. The mount's own `c`
// keeps the app's env; this is the one write that cannot be typed by it.
const toNext = async (
  _app: {},
  ctx: { readonly c: Context<any>; readonly next: Next } & Record<string, unknown>,
) => {
  const { c, next, ...derived } = ctx
  for (const [key, value] of Object.entries(derived)) c.set(key, value)
  await next()
  return undefined
}

// `E` is written once per app, where the deps are curried: `hono<MyEnv>(deps)`.
// It defaults to Hono's blank env, which is what an app with no bindings and no
// variables has.
export const hono = <App extends object, E extends Env = BlankEnv>(deps: App) => ({
  // THE PATTERN IS WRITTEN ONCE. `route` takes it, hands back the pair Hono
  // itself wants — `app.get(...route(…))` — and in between builds the scope on
  // a carrier typed BY that pattern, so `c.req.param('id')` is `string`.
  //
  // Which is why the scope arrives as a FUNCTION of the carrier rather than as
  // a value: a step is checked against `Ctx<S>` when it is ADDED, so a pattern
  // supplied after the chain was built would arrive too late to type anything.
  //
  // Hono's reader is SOFTER than Express's: a param the pattern does not
  // declare is not refused, it comes back `string | undefined` — unusable as a
  // string without a check, which is the same safe direction by a weaker route.
  route: <Path extends string>(
    path: Path,
    build: (
      carrier: HonoCarrier<Path, E>,
    ) => (app: App, args: { readonly c: Context<E, Path> }) => unknown,
  ): [Path, (c: Context<E, Path>) => Promise<Response>] => {
    const sc = build({})
    return [path, (c) => sc(deps, { c }) as Promise<Response>]
  },

  // Hono's middleware is real — it awaits `next()` and can act after it — so
  // unlike Express's, `mw` returns a promise the host awaits.
  //
  // No pattern here, and none to take: `app.use(…)` mounts across routes, so
  // there is no one pattern to read its params from.
  mw:
    <S extends State>(sc: Scope<S>) =>
    async (c: Context<E>, next: Next): Promise<void> => {
      const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
        app: App,
        args: unknown,
      ) => unknown
      await finished(deps, { c, next })
    },
})
