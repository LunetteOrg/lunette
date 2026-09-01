// THE WORDS a carrier coins — the two things a step can hand back besides a
// plain domain value. `Abort` STOPS the fold; `Ok` succeeds while naming an
// intent of its own (`json(v, 201)`). Both are branded so the fold recognises
// them at runtime, and neither carries a vocabulary: `intent` is opaque here,
// and what one MEANS belongs to the carrier that coined it.
//
// Read this file asking "what does it know about HTTP?" The answer is nothing —
// every HTTP name lives in the carrier that offers HTTP.

// REGISTERED, not fresh. `Symbol()` is unique per module evaluation, so two
// copies of this package in one dependency graph mint two different brands and
// stop recognising each other's words — a `refused()` from one is read by the
// other as an ordinary domain value, and the run SUCCEEDS with the abort object
// inside `value`. Verified, and silent. The global registry makes the brand what
// it is meant to be: a contract about a shape, not about an instance.
//
// The key carries a VERSION for the same reason the registry is global. Two
// copies of the SAME version are what the registry is meant to reconcile; two
// different MAJORS are not, and an unversioned key makes them recognise each
// other's brands while their shapes differ — a word built by one passing the
// other's check and being read for fields it does not have. Bumping the segment
// with the shape turns that silent misread into a value the other side does not
// recognise at all, which is the failure the fold already handles.
export const ABORT: unique symbol = Symbol.for('lntt.scope.abort.1')
export const OK: unique symbol = Symbol.for('lntt.scope.ok.1')

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
// `I` is DECLARED, not inferred: the payload (`{ kind: 'status', status: 404 }`)
// and the NAME a gate reads (`status`) are two different statements, and only
// the second is the vocabulary. Which makes the DEFAULT load-bearing — it is
// what an author gets by declaring nothing. Left to the constraint it would be
// `keyof object`, which is `never`: a word declaring nothing, admitted
// everywhere. `UnknownIntent` fails CLOSED instead.
//
// WHERE it is declared differs between the two, and only `abort` takes it as a
// bare type argument. `ok` has `V` to infer, and type arguments are all-or-
// nothing: `ok<{ readonly status: true }>(v, i)` names `V`, not `I`. So a
// carrier's success words declare theirs on the CONSTRUCTOR's return type —
// `(v: V, at: string): Ok<V, { readonly 'ok-served': true }> => ok(v, {…})` —
// which supplies `I` contextually and keeps `V` inferred. Writing both
// arguments works too and pins the value type at every call site, which is the
// thing the constructor exists to avoid.
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
