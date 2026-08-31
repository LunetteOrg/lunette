// THE WORDS a carrier coins — the two things a step can hand back besides a
// plain domain value. `Abort` STOPS the fold; `Ok` succeeds while naming an
// intent of its own (`json(v, 201)`). Both are branded so the fold recognises
// them at runtime, and neither carries a vocabulary: `intent` is opaque here,
// and what one MEANS belongs to the carrier that coined it.
//
// Read this file asking "what does it know about HTTP?" The answer is nothing —
// every HTTP name lives in the carrier that offers HTTP.

export const ABORT: unique symbol = Symbol('scope.abort')
export const OK: unique symbol = Symbol('scope.ok')

// Written without its parameter, `Abort` means "an intent nobody declared" and
// fails CLOSED — refused wherever a gate checks it — rather than collapsing to
// `never` and mounting anywhere — a word that declares nothing is admitted by
// every gate, which is fail-OPEN.
export interface UnknownIntent {
  readonly __unknown_intent: true
}

// `__i` is phantom and INVARIANT: a contravariant one would let a caller name
// the gate away by supplying `never`.
export interface Abort<I extends object = UnknownIntent> {
  readonly [ABORT]: true
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// `value` stays the DOMAIN value and the intent travels beside it, so a scope
// whose leaf returns `json(post, 201)` still yields a `Post` and not a wrapper.
export interface Ok<V, I extends object> {
  readonly [OK]: true
  readonly value: V
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// ── the constructors ─────────────────────────────────────────────────────────
// What a carrier writes. The brand is the core's, the intent inside is the
// carrier's and is never read here.
//
// `I` is DECLARED by the caller, not inferred: the payload
// (`{ kind: 'status', status: 404 }`) and the NAME a gate reads (`status`) are
// two different statements, and only the second is the vocabulary. Which makes
// the DEFAULT load-bearing — it is what an author gets by forgetting the type
// argument. Left to the constraint it would be `keyof object`, which is
// `never`: a word declaring nothing, admitted everywhere. `UnknownIntent` fails
// CLOSED instead.
export const abort = <I extends object = UnknownIntent>(intent: object): Abort<I> => ({
  [ABORT]: true,
  intent,
})

export const ok = <V, I extends object = UnknownIntent>(value: V, intent: object): Ok<V, I> => ({
  [OK]: true,
  value,
  intent,
})

export const isAbort = (x: unknown): x is Abort<never> =>
  typeof x === 'object' && x !== null && ABORT in x
export const isOk = (x: unknown): x is Ok<unknown, never> =>
  typeof x === 'object' && x !== null && OK in x
