// `@lntt/scope/hono` — the Hono carrier and its mounts.
//
// A carrier is `__args` alone (§43). Hono's whole request lives on one value,
// `c`, so that is what a run brings: `c.req` reads, `c.json`/`c.notFound`
// answer, and a step that answers returns Hono's own `Response`.

import type { Context, Next } from 'hono'
import type { BlankEnv, Env, ParamKeys } from 'hono/types'
import type { ResultOf, Scope, State } from '../index.ts'

// `Path` is the ROUTE PATTERN the scope is written for, and it is what makes
// `c.req.param('id')` typed — Hono's own `Context<Env, Path>` does the reading,
// and there is no parser of ours anywhere. It defaults to the bare `string`: a
// scope that names no pattern reads `string | undefined` and mounts anywhere.
//
// `E` is the app's Hono environment (its bindings and variables). It is a type
// parameter rather than a fixed `BlankEnv` because a step annotating a richer
// `Context<MyEnv, …>` than the carrier publishes would be refused at the
// argument by contravariance — the env has to come in at the carrier or not at
// all.
export interface HonoCarrier<Path extends string = string, E extends Env = BlankEnv> {
  readonly __args?: { readonly c: Context<E, Path> }
}

// PURE DECLARATION — the returned object carries nothing; the type arguments
// are the whole point of the call. `honoCarrier()` names no pattern;
// `honoCarrier<'/posts/:id'>()` says which one the scope reads, and
// `route(path, …)` can then check the mounted pattern against it.
export const honoCarrier = <Path extends string = string, E extends Env = BlankEnv>(): HonoCarrier<
  Path,
  E
> => ({})

// Whatever a middleware's steps derive lands on `c` (via `c.set`) before Hono's
// own `next()` runs — the leaf every `mw()` chain ends on, appended by `mw`
// itself so nobody has to remember to write it.
//
// `Context<any>` here, and only here: what a middleware's steps populate are
// keys no `Env['Variables']` declares — `c.set` on a typed env accepts only the
// names that env wrote down, and these are the run's own.
const toNext = async (
  _app: {},
  ctx: { readonly c: Context<any>; readonly next: Next } & Record<string, unknown>,
) => {
  const { c, next, ...derived } = ctx
  for (const [key, value] of Object.entries(derived)) c.set(key, value)
  await next()
  return undefined
}

// ── the route gate: what the scope READS against what the pattern SUPPLIES ───
// WE WRITE NO PARSER: `ParamKeys` is Hono's own reader, so this cannot drift
// from the router that matches paths at runtime — it knows, for one, that a
// bare wildcard names nothing.
declare const OPAQUE: unique symbol
type Opaque = typeof OPAQUE

// Hono keeps the `?` INSIDE the key for an optional param (`/posts/:id?` →
// `"id?"`); a declared pattern's keys never need to carry one into the
// comparison, so strip it on both sides.
type NameOf<K> = K extends `${infer N}?` ? N : K

// A NON-LITERAL pattern (`string`) means "cannot read this", never "no params":
// catching less is fine, rejecting a valid route is not. Read on the SUPPLY
// side as no opinion, and on the DEMAND side as naming nothing.
type Supplied<Path extends string> = string extends Path ? Opaque : NameOf<ParamKeys<Path>>
type Demanded<Path extends string> = string extends Path ? never : NameOf<ParamKeys<Path>>

// ONE DIRECTION: the scope DEMANDS — it reads `c.req.param('id')` — and the
// route SUPPLIES. A param the scope reads and the pattern does not supply is
// `undefined` at runtime; a param supplied and never read is nothing at all,
// the same verdict `DepGuard` gives the chain (a superset passes).
//
// The test is REVERSED on purpose: a param-less pattern's real key set is
// `never`, and `never extends Opaque` is VACUOUSLY TRUE — written the natural
// way round, the gate would skip every param-less route.
type Unsupplied<Mounted extends string, Declared extends string> = Opaque extends Supplied<Mounted>
  ? never
  : Exclude<Demanded<Declared>, Supplied<Mounted>>

type PathGate<Mounted extends string, Declared extends string> = [
  Unsupplied<Mounted, Declared>,
] extends [never]
  ? unknown
  : `⛔ this route does not supply a param the scope reads: ${Unsupplied<Mounted, Declared> & string}`

// The pattern the scope was started on, taken off its carrier.
type PathOf<S extends State> = S['args'] extends { readonly c: Context<any, infer P, any> }
  ? P & string
  : never

// `E` is written once per app, where the deps are curried: `hono<MyEnv>(deps)`.
// What a route mounted from this scope RETURNS. Hono's RPC client reads the
// handler's return type off `typeof app` — `c.json(v)` gives back a
// `TypedResponse` carrying `v`, and declaring the mount as `Promise<Response>`
// would erase it, leaving `hc<typeof app>()` with `unknown` where the leaf's
// value should be (pinned in `index.test-d.ts`). So the mount hands back what
// the SCOPE hands back, which is the union its steps accumulated.
type Answered<S extends State> = Promise<ResultOf<Scope<S>>>

export const hono = <App extends object, E extends Env = BlankEnv>(deps: App) => {
  const handlerFor =
    <S extends State>(sc: unknown) =>
    (c: Context<E, any>): Answered<S> =>
      (sc as (app: App, args: object) => Answered<S>)(deps, { c })

  return {
    // TWO FORMS, and the second is the first plus a check.
    //
    //   app.get('/posts/:id', route(scope))        the handler, nothing checked
    //   app.get(...route('/posts/:id', scope))     the pair, pattern checked
    //
    // The pattern cannot be checked in the one-argument form. On Hono the
    // reason differs from Express's and is worth knowing: the path IS the type
    // parameter of `app.get`, so the expected handler type is concrete — but
    // `Context<Env, Path>` is MUTUALLY ASSIGNABLE across paths, so
    // contravariance has nothing to bite on. Either way a pattern reaches a
    // type of ours only by being an ARGUMENT to one (`research/route-gate`).
    route: (<Path extends string, S extends State>(
      a: Path | Scope<S>,
      b?: Scope<S> & PathGate<Path, PathOf<S>>,
    ) => (b === undefined ? handlerFor(a) : [a as Path, handlerFor(b)])) as {
      <S extends State>(sc: Scope<S>): (c: Context<E, any>) => Answered<S>
      <Path extends string, S extends State>(
        path: Path,
        // The gate rides the SCOPE argument: intersected onto the path, a
        // failing gate collapses to `never` and the message is lost.
        sc: Scope<S> & PathGate<Path, PathOf<S>>,
      ): readonly [Path, (c: Context<E, any>) => Answered<S>]
    },

    // Hono's middleware is real — it awaits `next()` and can act after it — so
    // unlike Express's, `mw` returns a promise the host awaits.
    //
    // No pattern here, and none to take: `app.use(…)` mounts across routes.
    mw:
      <S extends State>(sc: Scope<S>) =>
      async (c: Context<E>, next: Next): Promise<void> => {
        const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
          app: App,
          args: unknown,
        ) => unknown
        await finished(deps, { c, next })
      },
  }
}
