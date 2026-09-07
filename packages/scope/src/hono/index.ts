// `@lntt/scope/hono` — the Hono carrier and its mounts.
//
// A carrier is `__args` alone (§43). Hono's whole request lives on one value,
// `c`, so that is what a run brings: `c.req` reads, `c.json`/`c.notFound`
// answer, and a step that answers returns Hono's own `Response`.

import type { Context, Next } from 'hono'
import type { BlankEnv, Env, ParamKeys } from 'hono/types'
import type { DepGuard, Next as StepNext, ResultOf, Scope, State } from '../index.ts'
import type { Opaque, Supply } from '../route-gate.ts'
import type { PathGate, ValidatedParams } from '../route-gate.ts'
import { fetchReads } from '../reads.ts'

// `E` is the app's Hono environment (its bindings and variables). It is a type
// parameter rather than a fixed `BlankEnv` because a step annotating a richer
// `Context<MyEnv, …>` than the carrier publishes would be refused at the
// argument by contravariance — the env has to come in at the carrier or not at
// all.
//
// AND IT IS THE ONLY ONE. The carrier used to take the ROUTE PATTERN too
// (`honoCarrier<'/posts/:id'>()`), which typed `c.req.param('id')` as `string`
// and gave `route` something to compare a mounted pattern against. It went with
// Express's own declaration (§53): the pattern was then written TWICE by hand —
// once on the carrier, once at the mount — and what the gate compares is now
// the `.validate('params', …)` schema, which is written once and checks the
// value rather than the name. `c.req.param('id')` is `string | undefined` here,
// as it is on any scope that names no pattern; `ctx.params` is where a scope
// reads a param it has actually checked.
export interface HonoCarrier<E extends Env = BlankEnv> {
  readonly __args?: { readonly c: Context<E> }
}

// PURE DECLARATION — the returned object carries nothing. The type argument is
// the env, and defaulting it is the ordinary case: an app with no bindings
// writes `honoCarrier()`.
export const honoCarrier = <E extends Env = BlankEnv>(): HonoCarrier<E> => ({})

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

// ── the route gate's Hono half: what a PATTERN supplies ──────────────────────
// `ParamKeys` is Hono's own reader and the only thing this file contributes to
// the gate; the comparison itself is `../route-gate.ts`, shared with Express.
// No parser of ours anywhere — Hono's knows, for one, that a bare wildcard
// names nothing.
//
// Hono keeps the `?` INSIDE the key for an optional param (`/posts/:id?` →
// `"id?"`), and it is MEANING, not noise: `/posts/:id?` also matches `/posts`,
// where the param never arrives. So the union is SPLIT on that suffix into the
// two sides `Supply` names, which is the same distinction Express's reader
// spells with an optional property.
//
// A NON-LITERAL pattern (`string`) means "cannot read this", never "no params":
// catching less is fine, rejecting a valid route is not.
type Supplied<Path extends string> = string extends Path
  ? Opaque
  : Supply<Exclude<ParamKeys<Path>, `${string}?`>, Optional<ParamKeys<Path>>>

type Optional<K> = K extends `${infer N}?` ? N : never

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
    // TWO VERBS, and the CHECKED one has the short name.
    //
    //   app.get(...route('/posts/:id', scope))     the pattern checked
    //   app.get('/posts/:id', handler(scope))      the bare handler, nothing checked
    //
    // The reasoning is the Express carrier's and holds here word for word: the
    // adjective belongs on whoever gives something up, so the escape hatch is
    // the one that has to be named.
    //
    // WHAT `route` COMPARES IS THE SCHEMA (§53), the same on both hosts: a
    // scope says what the URL carries once, in `.validate('params', schema,
    // onError)`, and the gate reads that against the mounted pattern. It used
    // to read a pattern declared on the carrier, which meant writing
    // `/posts/:id` twice by hand and checking a param's NAME where the schema
    // checks its value.
    //
    // WHY `handler` cannot check the pattern differs from Express's, and is
    // worth knowing: the path IS the type parameter of `app.get`, so the
    // expected handler type is concrete — and it STILL does not catch a
    // mismatch, because `Context<Env, Path>` is MUTUALLY ASSIGNABLE across
    // paths (each accepts the other, verified), so contravariance has nothing
    // to bite on. The path types `c.req.param('id')` correctly; it does not
    // constrain assignability. Either way a pattern reaches a type of ours only
    // by being an ARGUMENT to one, which is what `route` is for.
    //
    // Both carry `DepGuard` and the carrier gate: the deps were curried at
    // `hono(deps)`, so a mount owes the scope what a direct call owes it.
    route: <Path extends string, S extends State>(
      path: Path,
      // The gates ride the SCOPE argument: intersected onto the path, a failing
      // gate collapses to `never` and the message is lost.
      sc: Scope<S> &
        ArgsGate<E> &
        PathGate<Supplied<Path>, ValidatedParams<S>> &
        DepGuard<App, S['need']>,
    ): readonly [Path, (c: Context<E, any>) => Answered<S>] => [path, handlerFor<S>(sc)],

    handler: <S extends State>(
      sc: Scope<S> & ArgsGate<E> & DepGuard<App, S['need']>,
    ): ((c: Context<E, any>) => Answered<S>) => handlerFor<S>(sc),

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

// ── the read extensions ──────────────────────────────────────────────────────
// PLAIN STEPS, not verbs: these ADD a ctx entry, and a verb is what may REPLACE
// one (`@lntt/scope/guard`). The line falls where the core's own gate already
// is, so it is not a matter of taste.
//
// They live here, in the host's own subpath, because there is no generic way to
// read a request. What is generic is the ENTRY they populate: a step annotating
// `{ query: Query }` names no carrier and mounts wherever a `query` was
// populated, which is what these exist to make possible.

export type { Query, Cookies, Headers_ as HeaderEntries, Encoding, BodyOf } from '../reads.ts'

// `c.req.raw` is the Fetch `Request` Hono is built on, so these read the same
// source React Router's do — ONE implementation for the whole Fetch family, in
// `reads.ts`, and this subpath passes the one line that differs: where the
// request is found.
const reads = fetchReads((ctx: { readonly c: Context<any, any> }) => ctx.c.req.raw)

// `c.req.param()` with no argument is Hono's own way to hand back the whole
// bag, already a plain string-keyed record — so there is nothing to adapt and
// this one does not go through `fetchReads`, which reads the Fetch `Request`
// and knows nothing of a router's matches.
//
// FIXED shape, not generic over a pattern: a generic read extension does not
// get its type parameter inferred through `.step()` and adds NOTHING, silently
// (measured on Express's twin, §52). So `ctx.params` starts WIDE and
// `.validate('params', schema, onError)` is what narrows it — and what `route`
// compares a mounted pattern against (§53).
export const params = async (
  _app: {},
  { c }: { readonly c: Context<any, any> },
  next: StepNext<{ params: Record<string, string> }>,
) => next({ params: c.req.param() })

export const query = reads.query
export const headers = reads.headers
export const cookies = reads.cookies
export const body = reads.body
