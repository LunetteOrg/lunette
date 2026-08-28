// THE MOUNTS. Two gates meet here.
//
// 1. The INTENT gate: each mount names, by hand, the set of intents it can
//    render. Demand is open (any carrier may coin a word), supply is written
//    out per mount, so an intent nobody has claimed mounts NOWHERE.
//
// 2. The ROUTE gate: the route pattern and the `.params()` schema are two
//    independent declarations that nothing keeps aligned today — rename
//    `:postId` to `:wrongName` and every host still compiles, failing at
//    runtime with a 422. The pattern reaches the mount as a string literal and
//    is compared with the schema's keys. We do NOT extract: matching the route
//    stays the framework's job (it owns the pattern language, and the URL a
//    scope reads is normalised while the router matched the raw target — an
//    extractor of ours could disagree with it on `/a/../b`).
import type { Handler, MountGate, Outcome } from './scope.ts'
import { runScope } from './scope.ts'
import { type Rendered, toResponse } from './http.ts'
import { toRpcResult } from './rpc.ts'

type HttpIntents = 'status' | 'redirect' | 'ok-status'
// RPC renders its own word and nothing else — no redirect, and no success
// status, because an RPC reply has no status line to put one in.
type RpcIntents = 'code'

// ── reading a route pattern ──────────────────────────────────────────────────
// THE RULE THAT MAKES THIS SAFE: anything not modelled yields `Opaque`, and an
// opaque pattern is NOT checked. It may fail to catch a mismatch; it must never
// reject a valid route. Two of the three bugs found while writing this were
// false positives, so the bail-outs are the load-bearing part, not the parser.
//
// In the real packs this lives PER FRAMEWORK, next to the dependency whose
// syntax it models: `@lntt/integration/hono` reuses Hono's own exported
// `ParamKeys` (it cannot drift from the router, because it IS the router's),
// and only `@lntt/integration/express` needs a reader of its own, since
// path-to-regexp types its params as a bare `object`.
declare const OPAQUE: unique symbol
export type Opaque = typeof OPAQUE

type NameOf<R extends string> = R extends `${string}(${string}`
  ? Opaque // `:id(\d+)` — the `:` branch wins first, so re-check here
  : R extends `${infer N}{${string}`
    ? N // Hono `:date{[0-9]+}`
    : R extends `${infer N}?`
      ? N // Hono `:id?`
      : R extends `${string}*${string}`
        ? Opaque
        : R

type Seg<S extends string> = string extends S
  ? Opaque // a `${string}` hole in the path tells us nothing
  : S extends `:${infer Rest}`
    ? NameOf<Rest>
    : S extends `${string}*${string}`
      ? Opaque // wildcards: Hono `/*`, Express 5 `*path`
      : S extends `${string}{${string}`
        ? Opaque // Express 5 optional group `{/:id}`
        : S extends `${string}(${string}`
          ? Opaque // an inline regex group of any dialect
          : never // a static segment names nothing

type Split<P extends string> = P extends `${infer Head}/${infer Tail}`
  ? Seg<Head> | Split<Tail>
  : Seg<P>

export type PathParams<P extends string> = string extends P
  ? Opaque
  : Opaque extends Split<P>
    ? Opaque
    : Split<P>

// `Opaque extends PathParams<P>`, and NOT `PathParams<P> extends Opaque`. A
// route with no params reads as `never`, and `never extends Opaque` is
// VACUOUSLY TRUE — written the natural way round, every param-less route was
// taken for an unreadable one and checked nothing, so a schema could declare a
// param `/feed` does not have. Wrapping in a tuple does not help: `never` is
// assignable to anything, tuple or not. Only the reversed test tells the two
// apart. The same vacuous-truth trap decision 34 had to close on `Exclude`,
// surfacing in a new place.
type PathGate<
  P extends string,
  Par,
  Missing = Opaque extends PathParams<P> ? never : Exclude<PathParams<P>, keyof Par>,
  Extra = Opaque extends PathParams<P> ? never : Exclude<keyof Par, PathParams<P>>,
> = [Missing] extends [never]
  ? [Extra] extends [never]
    ? unknown
    : `⛔ the schema declares a param this route does not have: ${Extra & string}`
  : `⛔ this route has a param the schema does not declare: ${Missing & string}`

// ── the mounts ───────────────────────────────────────────────────────────────
// Returns a TUPLE to spread into the framework's own registration, so the
// pattern is written ONCE: `app.get(...route('/posts/:postId', postScope))`.
export const route = <P extends string, R, Int, Par>(
  path: P,
  handler: Handler<R, Int, Par> & MountGate<Int, HttpIntents> & PathGate<P, Par>,
) =>
  [
    path,
    async (raw: unknown): Promise<Rendered> =>
      toResponse((await runScope(handler, raw)) as Outcome<unknown>),
  ] as const

// tRPC takes no path, so there is no route gate here — and that is a REAL gap,
// not a simplification: on tRPC and on React Router (whose routes live in their
// own config file) the pattern never reaches a mount, so nothing checks it.
export const toProcedure =
  <R, Int, Par>(handler: Handler<R, Int, Par> & MountGate<Int, RpcIntents>) =>
  async (raw: unknown): Promise<R> =>
    toRpcResult(await runScope<R>(handler, raw))
