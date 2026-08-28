// THE CORE. It coins NO vocabulary — no `notFound`, no 404, no `redirect`.
// What lives here is only what every carrier has by definition: a way to stop
// the fold, a way to report that the fold failed on its own, and the builder.
//
// Read this file asking "what does it know about HTTP?". The answer is nothing.

// The shape of a thing several carriers happen to have. It is a TYPE, not a
// vocabulary word: `RequestHead` names no outcome and commands nothing, so it
// can live in the core the way `Outcome` does. Each carrier that has one
// exposes it; a queue carrier simply does not.
export interface RequestHead {
  readonly url: string
  readonly method: string
  readonly headers: ReadonlyMap<string, string>
}

export const ABORT: unique symbol = Symbol('scope.abort')
export const OK: unique symbol = Symbol('scope.ok')

// ── the two things a guard or a leaf can hand back besides a plain value ─────

// An abort STOPS the fold. Its intent is a word from some carrier's vocabulary;
// the core never reads it, it only checks the brand.
export interface Abort<I extends object = UnknownIntent> {
  readonly [ABORT]: true
  readonly intent: unknown
  // Phantom only. The core does not know these names; it carries them so the
  // definition and the mount can compare them.
  readonly __i?: (i: I) => I
}

// A success that carries an intent of its own — `json(v, 201)`, `html(v)`.
// The VALUE is still the domain value: a codec unwraps it, `R` never becomes
// the wrapper.
export interface Ok<V, I extends object> {
  readonly [OK]: true
  readonly value: V
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// An `Abort` written without its parameter means "an intent nobody declared".
// It must fail CLOSED — refused everywhere — rather than collapse to `never`
// and mount anywhere, which is the fail-open decision 34 had to close.
export interface UnknownIntent {
  readonly __unknown_intent: true
}

export const isAbort = (x: unknown): x is Abort<never> =>
  typeof x === 'object' && x !== null && ABORT in x
export const isOk = (x: unknown): x is Ok<unknown, never> =>
  typeof x === 'object' && x !== null && OK in x

// ── the outcome ──────────────────────────────────────────────────────────────
// THREE branches, not two. The third is the fold failing on its own: the input
// did not validate. It is NOT an abort, because an abort is a word from a
// carrier's vocabulary and the core has none. Being a separate branch also
// means a codec that forgets it does not compile.
export type Issue = { readonly path: readonly string[]; readonly message: string }

export type Outcome<R> =
  | { readonly ok: true; readonly value: R; readonly intent: unknown }
  | { readonly ok: false; readonly abort: Abort<never> }
  | { readonly ok: false; readonly invalid: { readonly issues: readonly Issue[] } }

// ── extracting the vocabulary out of what a function RETURNS ─────────────────
// This is the load-bearing shape. Inferring the intent from INSIDE a union
// constituent (`(ctx) => E | Abort<I>`) makes TypeScript pick the first
// candidate and reject the rest, so a guard that can return two different
// intents stops compiling. Inferring the whole return type and distributing
// afterwards collects every constituent instead.
type AnyAbort = Abort<never> | Abort<any>
type AnyOk = Ok<any, any>

// One conditional per case, not two: the outer `extends AnyAbort` guard the
// first draft had was redundant with the `infer`, and paid for twice per verb.
export type IntentKeysOf<R> = R extends Abort<infer I>
  ? keyof I
  : R extends Ok<any, infer I>
    ? keyof I
    : never

// The domain value: an abort contributes none, an `Ok` unwraps to its value.
export type ValueOf<R> = R extends AnyAbort ? never : R extends Ok<infer V, any> ? V : R

// Stored as a MAP so intersection accumulates across guards and `keyof` reads
// the union back — the same trick the capability axis already uses. It takes
// the KEYS rather than recomputing the distribution.
export type IntentMap<K extends PropertyKey> = { [P in K]: true }
