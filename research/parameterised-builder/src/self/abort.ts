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

export const isAbort = (x: unknown): x is Abort<never> =>
  typeof x === 'object' && x !== null && ABORT in x
export const isOk = (x: unknown): x is Ok<unknown, never> =>
  typeof x === 'object' && x !== null && OK in x
