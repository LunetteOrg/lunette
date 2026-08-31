// Outcome-vocabulary spike — a SELF-CONTAINED model of the proposed machinery:
// the intent is INFERRED from what a guard/leaf returns, accumulated on the
// builder, and checked twice — once at the definition against what the scope
// extended, once at the mount against what the host renders. It imports nothing
// from src/: the point is to learn whether the inference holds BEFORE the real
// core is reshaped. Throwaway — retire once the change ships.
//
// Two findings are load-bearing and neither was predicted:
//
// 1. The intent CANNOT be inferred from inside a union constituent
//    (`g: () => E | Abort<I>`). Given two abort constituents TypeScript picks
//    the first candidate and REJECTS the second — no silent loss, but a
//    legitimate guard stops compiling. Variance does not help: invariant,
//    covariant and contravariant phantoms all behave the same, and inferring
//    the whole abort union collapses to the constraint (§39's negative).
//    Inferring the whole RETURN TYPE and distributing afterwards collects every
//    constituent.
//
// 2. The gate belongs in the PARAMETER position, not the return type. §39(b)
//    suggested otherwise, but its trap does not apply: the gate is a
//    conditional type over R, which is not an inference site, so R still infers
//    from the function's return position. That buys the error landing on the
//    offending ARGUMENT instead of on the next call in the chain.
import { describe, it } from 'vitest'

declare const ABORT: unique symbol
declare const OK: unique symbol

interface Abort<I extends object = UnknownIntent> {
  readonly [ABORT]: true
  readonly __i?: (i: I) => I
}
// A success carrying its own intent — `json(v, 201)`, `html(v)`, `response(…)`.
interface Ok<V, I extends object> {
  readonly [OK]: true
  readonly __v?: V
  readonly __i?: (i: I) => I
}
// A bare `Abort` must fail CLOSED: an intent nobody declares, refused
// everywhere, rather than collapsing to `never` and mounting anywhere (§34).
interface UnknownIntent {
  readonly __unknown_intent: true
}
type AnyAbort = Abort<any>
type AnyOk = Ok<any, any>

// ── distributive extraction over the WHOLE return union ──────────────────────
type IntentKeysOf<R> = R extends AnyAbort
  ? R extends Abort<infer I>
    ? keyof I
    : never
  : R extends AnyOk
    ? R extends Ok<any, infer I>
      ? keyof I
      : never
    : never
// The domain value: an `Ok` wrapper unwraps, an abort contributes nothing.
type ValueOf<R> = R extends AnyAbort ? never : R extends Ok<infer V, any> ? V : R
// Stored as a MAP so intersection accumulates across guards and `keyof` reads
// the union back — the trick `__caps` already uses (scope.ts:129-135).
type IntentMapOf<R> = { [K in IntentKeysOf<R>]: true }

type IntentsOf<T> = T extends { readonly __intents?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never

type Undeclared<Self, R> = Exclude<IntentKeysOf<R>, DeclaredOf<Self>>
// The gate rides the ARGUMENT, so the error lands on the offending function.
type DeclGate<Self, R> = [Undeclared<Self, R>] extends [never]
  ? unknown
  : `⛔ this scope does not declare the intent: ${Undeclared<Self, R> & string}`

interface Handler<R, Int> {
  readonly __r?: R
  readonly __int?: (i: Int) => Int
}

interface Ctx {
  readonly session: string
}

interface Scope {
  readonly __acc?: object
  readonly __intents?: object
  readonly __declares?: object

  extend<F extends object, Self = this>(this: Self, ext: F): Self & F

  guard<R, Self = this>(
    this: Self,
    g: ((ctx: Ctx) => R) & DeclGate<Self, Awaited<R>>,
  ): Self & { readonly __acc?: ValueOf<Awaited<R>>; readonly __intents?: IntentMapOf<Awaited<R>> }

  handle<R, Self = this>(
    this: Self,
    leaf: ((ctx: Ctx) => R) & DeclGate<Self, Awaited<R>>,
  ): Handler<ValueOf<Awaited<R>>, IntentsOf<Self> | IntentKeysOf<Awaited<R>>>
}

declare const scope: () => Scope

interface HttpExtension {
  readonly __declares?: { redirect: true; status: true; 'ok-status': true }
}
declare const http: HttpExtension
interface WideExtension {
  readonly __declares?: { redirect: true; status: true; 'retry-after': true }
}
declare const wide: WideExtension

declare const redirect: (to: string) => Abort<{ redirect: true }>
declare const notFound: () => Abort<{ status: true }>
declare const retryAfter: (s: number) => Abort<{ 'retry-after': true }>
declare const json: <V>(v: V, status: number) => Ok<V, { 'ok-status': true }>

// ── the mounts ───────────────────────────────────────────────────────────────
type MountGate<Int, HostInt> = [Exclude<Int, HostInt>] extends [never]
  ? unknown
  : `⛔ this host cannot render the intent: ${Exclude<Int, HostInt> & string}`

declare function toProcedure<R, Int>(h: Handler<R, Int> & MountGate<Int, 'status'>): void
declare function honoHandler<R, Int>(
  h: Handler<R, Int> & MountGate<Int, 'status' | 'redirect' | 'ok-status'>,
): void

// ── the probes ───────────────────────────────────────────────────────────────
declare const loginGuard: (ctx: Ctx) => { session: string } | Abort<{ redirect: true }>
declare const plainGuard: (ctx: Ctx) => { feed: string[] }
declare const leafOk: (ctx: Ctx) => { post: string }

// P1 — an intent the scope never declared, rejected ON THE GUARD ARGUMENT.
// @ts-expect-error the scope did not .extend(http), so 'redirect' is undeclared
const p1 = scope().guard(loginGuard).handle(leafOk)

// P2 — declared, then mounted: tRPC refuses naming the intent, Hono accepts.
const p2 = scope().extend(http).guard(loginGuard).handle(leafOk)
// @ts-expect-error tRPC cannot render 'redirect'
toProcedure(p2)
honoHandler(p2)

// P3 — TWO intents in one guard: a legitimate guard compiles and BOTH survive.
declare const rateGuard: (
  ctx: Ctx,
) => { ok: true } | Abort<{ status: true }> | Abort<{ 'retry-after': true }>
const p3 = scope().extend(wide).guard(rateGuard).handle(leafOk)
// @ts-expect-error 'retry-after' survived the inference and tRPC cannot render it
toProcedure(p3)

// P3b — the same guard where only one of the two is declared: rejected, naming
// the MISSING one, on the guard argument.
// @ts-expect-error 'retry-after' is undeclared
const p3b = scope().extend(http).guard(rateGuard).handle(leafOk)

// P4 — a bare `Abort` fails CLOSED.
declare const legacyGuard: (ctx: Ctx) => { x: 1 } | Abort
// @ts-expect-error an unparameterised Abort declares an intent nobody renders
const p4 = scope().extend(http).guard(legacyGuard).handle(leafOk)

// P5 — the intent survives an indirection through a helper.
declare const abortFor: (tag: string) => Abort<{ status: true }>
const viaHelper = (ctx: Ctx): { post: string } | Abort<{ status: true }> => abortFor(ctx.session)
const p5 = scope().extend(http).guard(viaHelper).handle(leafOk)
toProcedure(p5)

// P6 — a guard that never aborts is untouched and mounts everywhere.
const p6 = scope().guard(plainGuard).handle(leafOk)
toProcedure(p6)
honoHandler(p6)

// P7 — the leaf's own intent joins the guards'.
declare const leafRedirects: (ctx: Ctx) => { post: string } | Abort<{ redirect: true }>
const p7 = scope().extend(http).handle(leafRedirects)
// @ts-expect-error tRPC cannot render the leaf's 'redirect'
toProcedure(p7)
honoHandler(p7)

// P8 — async guard + INLINE arrow leaf keeping its contextual ctx.
declare const asyncGuard: (
  ctx: Ctx,
) => Promise<{ role: string } | Abort<{ status: true }> | Abort<{ redirect: true }>>
const p8 = scope().extend(http).guard(asyncGuard).handle((ctx) => ({ who: ctx.session }))
honoHandler(p8)

// P9 — an inline arrow aborting with an UNDECLARED intent errors on the arrow.
// @ts-expect-error 'retry-after' is undeclared
const p9 = scope().extend(http).guard((ctx) => (ctx.session ? { a: 1 } : retryAfter(3)))

// P10 — `json(v, 201)`: R must stay the DOMAIN value, not the wrapper, so `hc`
// still sees { post: string }; and the ok-intent gates like any other.
const p10 = scope()
  .extend(http)
  .handle((ctx) => json({ post: ctx.session }, 201))
honoHandler(p10)
// @ts-expect-error tRPC renders abort-side statuses but has no success status
toProcedure(p10)

describe('outcome-vocabulary spike', () => {
  it('models the proposed machinery', () => {
    void p1
    void p2
    void p3
    void p3b
    void p4
    void p5
    void p6
    void p7
    void p8
    void p9
    void p10
    void redirect
    void notFound
  })
})
