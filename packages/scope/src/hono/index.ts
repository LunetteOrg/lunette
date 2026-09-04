// `@lntt/scope/hono` — the Hono carrier and its mounts.
//
// A carrier is `__args` alone (§43). Hono's whole request lives on one value,
// `c`, so that is what a run brings: `c.req` reads, `c.json`/`c.notFound`
// answer, and a step that answers returns Hono's own `Response`.

import type { Context, Next } from 'hono'
import type { BlankEnv, Env, ParamKeys } from 'hono/types'
import type { DepGuard, ResultOf, Scope, State } from '../index.ts'

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
// `"id?"`), and it is MEANING, not noise: `/posts/:id?` also matches `/posts`,
// where `c.req.param('id')` is `undefined`. So both sides keep it and `Unmet`
// below reads it — stripped on the supply side, an optional param would satisfy
// a scope that reads a required one, which is the exact mismatch this gate
// exists to catch.
//
// A NON-LITERAL pattern (`string`) means "cannot read this", never "no params":
// catching less is fine, rejecting a valid route is not. Read on the SUPPLY
// side as no opinion, and on the DEMAND side as naming nothing.
type Supplied<Path extends string> = string extends Path ? Opaque : ParamKeys<Path>
type Demanded<Path extends string> = string extends Path ? never : ParamKeys<Path>

// One demanded key against the whole supplied set, DISTRIBUTED over the union.
// An optional demand (`"id?"`) takes either — the step already reads
// `string | undefined`. A required one takes only the required supply.
type Unmet<Demand, Sup> = Demand extends `${infer N}?`
  ? [Extract<Sup, N | `${N}?`>] extends [never]
    ? N
    : never
  : [Extract<Sup, Demand>] extends [never]
    ? Demand
    : never

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
  : Unmet<Demanded<Declared>, Supplied<Mounted>>

type PathGate<Mounted extends string, Declared extends string> = [
  Unsupplied<Mounted, Declared>,
] extends [never]
  ? unknown
  : `⛔ this route does not supply a param the scope reads: ${Unsupplied<Mounted, Declared> & string}`

// ── gate: the scope was written for THIS carrier ─────────────────────────────
// NO GATE OF OURS: what the mount brings is written as a FUNCTION the scope
// must be assignable to, and `strictFunctionTypes` refuses one demanding args
// the mount does not bring — the shape `trpc.procedure` and `reactRouter`
// already had by naming `S['args']` in a real parameter position. An Express
// scope mounted here used to compile and die reading `c` off `{ req, res }`.
// The reasoning, and why this is a function rather than a message, is written
// out in the Express carrier.
//
// `Context<E, any>` is what `handlerFor` really hands over, and the path stays
// `any`: `Context` is MUTUALLY ASSIGNABLE across paths (the note on `route`
// below), so the pattern is `PathGate`'s to judge and this member says nothing
// about it.
type ArgsGate<E extends Env> = (app: never, args: { readonly c: Context<E, any> }) => unknown

// ── gate: a middleware ANSWERS with a Response, or with nothing ──────────────
// A `route` needs no such check: its mount is declared to hand back what the
// scope handed back, so Hono's own handler type reads it. A `mw` does not —
// what it returns is `Response | void`, and everything else is dropped. Under
// the library's error convention a RETURNED error is a domain value (§3), so
// `return { error: 'unauthorized' }` is the natural thing to write for a guard
// that stops; Hono then sees `undefined` with the chain uncalled and answers
// 500. Measured. The twin of Express's `AnswerGate`, and the reasoning is
// written out there.
type Unsendable<S extends State> = Exclude<ResultOf<Scope<S>>, Response | undefined>

type AnswerGate<S extends State, Then = unknown> = [Unsendable<S>] extends [never]
  ? Then
  : `⛔ a middleware answers with a Response: this scope's leaf hands back a value Hono will not send`

// ── gate: what a MIDDLEWARE derives, against what the run itself brought ─────
// `toNext` strips `c` and `next` back off by NAME, because the fold hands it
// one merged object and a name is all there is to tell the run's own args from
// what the steps populated. A step deriving either is dropped on the way out
// and never reaches `c.set`, with nothing saying so. The reasoning is written
// out in the Express carrier, where the same collision hangs the request; the
// refusal belongs at the mount that strips, and `route` — which copies nothing
// out — takes no such gate.
type Strips<S extends State> = Extract<keyof S['acc'], 'c' | 'next'>

type StripGate<S extends State> = [Strips<S>] extends [never]
  ? unknown
  : `⛔ this middleware derives a ctx key the run itself brought: ${Strips<S> & string} — the leaf strips those by name, so it would never arrive`

// The pattern the scope was started on, taken off its carrier.
type PathOf<S extends State> = S['args'] extends { readonly c: Context<any, infer P, any> }
  ? P & string
  : never

// What a route mounted from this scope RETURNS. Hono's RPC client reads the
// handler's return type off `typeof app` — `c.json(v)` gives back a
// `TypedResponse` carrying `v`, and declaring the mount as `Promise<Response>`
// would erase it, leaving `hc<typeof app>()` with `unknown` where the leaf's
// value should be (pinned in `index.test-d.ts`). So the mount hands back what
// the SCOPE hands back, which is the union its steps accumulated.
type Answered<S extends State> = Promise<ResultOf<Scope<S>>>

// `E` is written once per app, where the deps are curried — and BOTH type
// arguments are written there: `hono<typeof deps, MyEnv>(deps)`. `App` comes
// first because it is what the deps gate reads, and TypeScript has no partial
// explicit list, so naming the env means naming the deps type beside it.
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
    // parameter of `app.get`, so the expected handler type is concrete — and it
    // STILL does not catch a mismatch, because `Context<Env, Path>` is MUTUALLY
    // ASSIGNABLE across paths (each accepts the other, verified), so
    // contravariance has nothing to bite on. The path types `c.req.param('id')`
    // correctly; it does not constrain assignability. Either way a pattern
    // reaches a type of ours only by being an ARGUMENT to one.
    route: (<Path extends string, S extends State>(
      a: Path | Scope<S>,
      b?: Scope<S> & PathGate<Path, PathOf<S>>,
    ) => (b === undefined ? handlerFor(a) : [a as Path, handlerFor(b)])) as {
      // `DepGuard` rides the scope argument on every form: the deps were
      // curried at `hono(deps)`, so a mount owes the scope what a direct call
      // owes it, and the same branded refusal says so.
      <S extends State>(
        sc: Scope<S> & ArgsGate<E> & DepGuard<App, S['need']>,
      ): (c: Context<E, any>) => Answered<S>
      <Path extends string, S extends State>(
        path: Path,
        // The gate rides the SCOPE argument: intersected onto the path, a
        // failing gate collapses to `never` and the message is lost.
        sc: Scope<S> & ArgsGate<E> & PathGate<Path, PathOf<S>> & DepGuard<App, S['need']>,
      ): readonly [Path, (c: Context<E, any>) => Answered<S>]
    },

    // Hono's middleware is real — it awaits `next()` and can act after it — so
    // unlike Express's, `mw` returns a promise the host awaits.
    //
    // No pattern here, and none to take: `app.use(…)` mounts across routes.
    mw: <S extends State>(
      // CHAINED, not intersected: `AnswerGate` and `StripGate` are both message
      // literals and both can fail here, and side by side they would collapse
      // to `never` with nothing left to read.
      sc: Scope<S> & ArgsGate<E> & DepGuard<App, S['need']> & AnswerGate<S, StripGate<S>>,
    ) => {
      // The leaf is appended ONCE, where `mw` is called. Built inside the
      // handler instead, every request would rebuild the step list and rewire
      // the verb map to reach the same value — `toNext` closes over nothing.
      const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
        app: App,
        args: unknown,
      ) => Promise<unknown>

      // A STEP THAT ANSWERS IS THE MIDDLEWARE'S ANSWER. A guard stops by
      // returning a response — `return c.json({ error: 'unauthorized' }, 401)`,
      // the same shape `route` takes — and never calls `next`; dropped here,
      // Hono would see `undefined` with the chain uncalled and answer 500. So
      // what the fold hands back is handed on when it is a `Response`, and the
      // one guard scope really does compose on every host.
      //
      // `Response | void` is Hono's own middleware return: `undefined` is what
      // `toNext` gives once the chain has run and Hono continues on it.
      return async (c: Context<E>, next: Next): Promise<Response | void> => {
        const answered = await finished(deps, { c, next })
        return answered instanceof Response ? answered : undefined
      }
    },
  }
}
