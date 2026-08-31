// The two things a guard or a leaf can hand back besides a plain domain
// value: a way to STOP the fold (`Abort`), and a way for the leaf to succeed
// while still naming an intent of its own (`Ok`, e.g. `json(v, 201)`). Both
// are branded so the fold recognises them at runtime; neither carries a
// vocabulary of its own — `intent` is opaque here. What an intent MEANS
// belongs to whichever carrier extension coined it (`@lntt/scope/http`, …).
// Read this file asking "what does it know about HTTP?" The answer is
// nothing: every HTTP name (`redirect`, `notFound`, `httpError`, …) lives in
// the carrier that offers HTTP, not here.

export const ABORT: unique symbol = Symbol('scope.abort')
export const OK: unique symbol = Symbol('scope.ok')

// Written without its parameter, `Abort` must mean "an intent nobody
// declared" and fail CLOSED — refused everywhere a definition-side gate
// checks it — rather than collapse to `never` and mount anywhere, which is
// the fail-open failure mode §34 had to close on the capability axis.
export interface UnknownIntent {
  readonly __unknown_intent: true
}

// An abort STOPS the fold. `intent` is opaque: a word from some carrier's
// vocabulary, and the core only ever checks the brand, never reads it. `__i`
// is phantom and INVARIANT — a contravariant phantom would let a caller name
// the gate away by supplying `never`, the same hole §34 closed on `Cap`.
export interface Abort<I extends object = UnknownIntent> {
  readonly [ABORT]: true
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// A success that carries an intent of its own (`json(v, 201)`, `html(v)`).
// `value` stays the DOMAIN value — a codec unwraps it, `R` never becomes a
// wrapper around it.
export interface Ok<V, I extends object> {
  readonly [OK]: true
  readonly value: V
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// ── the constructors ─────────────────────────────────────────────────────────
// What a carrier actually writes. The brand is the core's — it owns the
// MECHANISM — while the intent inside is the carrier's and is never read here.
// Before these existed every carrier re-declared the same line over the raw
// symbol: a cast in each of them, and one more place to get the brand wrong.
//
// `I` is DECLARED by the caller, not inferred. The payload
// (`{ kind: 'status', status: 404 }`) and the NAME the gate reads (`status`)
// are two different statements, and only the second is the vocabulary.
//
// So the DEFAULT is load-bearing: it is what an author gets by forgetting the
// type argument. `UnknownIntent` makes that fail CLOSED — its key is one no
// carrier coins, so the word is refused at every `WordGate`. Leaving it to the
// constraint would give `keyof object`, which is `never`: a word declaring
// nothing, and admitted everywhere. That is the fail-open §34 closed on the
// capability axis, reopened by an omission nobody would see.
export const abort = <I extends object = UnknownIntent>(intent: object): Abort<I> => ({
  [ABORT]: true,
  intent,
})

// The success side. `value` stays the DOMAIN value and the intent travels
// BESIDE it, which is why a scope whose leaf returns `json(post, 201)` still
// reports that it yields a `Post` and not a wrapper around one.
export const ok = <V, I extends object = UnknownIntent>(value: V, intent: object): Ok<V, I> => ({
  [OK]: true,
  value,
  intent,
})

export const isAbort = (x: unknown): x is Abort<never> =>
  typeof x === 'object' && x !== null && ABORT in x
export const isOk = (x: unknown): x is Ok<unknown, never> =>
  typeof x === 'object' && x !== null && OK in x
