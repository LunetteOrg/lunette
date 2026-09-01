
// THE PRIMITIVE. A step wraps the rest of the fold: it reads `app` and the ctx
// as it stands, and either continues inward with what it populates or returns
// something of its own and stops.
//
// Three things a step says, each riding a position the signature already has —
// which is why a step is a plain FUNCTION and declares nothing:
//
//   what it knows of the app      the first parameter's type
//   what it knows of the ctx      the second parameter's type
//   what it populates             `next`'s parameter type — ANNOTATED, below
//
// TERMINATION is not among them: not calling `next` ends the fold, and there is
// nothing to declare. Enriching the BUILDER is a different axis and a different
// verb (`Extension`, in `scope.ts`).
//
// The third one cost a measurement. `Add` occurs only in a parameter position
// of `next`, so it is NOT inferable from the `next(...)` calls in the body: a
// step written `(app, ctx, next) => next({ user })` infers `Add` as the bare
// constraint `object` and populates nothing as far as the builder is concerned.
// Annotating the parameter — `next: Next<{ user: User }>` — infers it exactly.
// The annotation IS the declaration, and it sits on the parameter it describes
// rather than in a phantom beside it.

// ── the WORDS a carrier coins ────────────────────────────────────────────────
// What a step returns when it has something to SAY beyond a domain value:
// `unauthorized()`, `redirect('/')`, `json(v, 201)`. Each is a value of the
// CARRIER's own type, and the core builds none of them — no constructor, no
// brand, no predicate. What it knows is the one shape below, read off a type.
//
// So a carrier shapes its words however its host needs, and the core stays out
// of it: a scope is a COMPOSER, not an error handler (§42). Read this asking
// "what does it know about HTTP?" The answer is nothing.

// Written without its parameter, `Word` means "an intent nobody declared" and
// fails CLOSED — refused wherever a gate checks it — rather than collapsing to
// `never` and mounting anywhere: a word that declares nothing is admitted by
// every gate, which is fail-OPEN.
export interface UnknownIntent {
  readonly __unknown_intent: true
}

// `intent` is REQUIRED, and that requirement is what makes the declaration
// readable without a brand. A phantom alone would not do: an all-optional shape
// is matched by nearly every type, so the gate would fire `infer` on plain
// domain values too and read their intent as `UnknownIntent`. Hanging the
// declaration on a member a word carries ANYWAY separates the two for free —
// and the core still never reads what an intent MEANS, only whether it is there
// and what it is called.
//
// `__i` is phantom and INVARIANT: a contravariant one would let a caller name
// the gate away by supplying `never`.
export interface Word<I extends object = UnknownIntent> {
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

// ── what `next` hands back ───────────────────────────────────────────────────
// The fold produces NOTHING of its own. A step returns something and the fold
// hands it back untouched — no branches, no `ok`, no normalising pass — so what
// a scope yields is what its leaf returned, and what that MEANS belongs to the
// carrier (§42).
//
// Which leaves one thing to name: what a step sees when it continues inward.
// When step 2 is written the builder cannot know what step 5 returns — step 5
// has not been added yet — so `next`'s return type has to stand for "the rest
// of the fold answered, whatever it said". Typed `unknown` it would poison the
// union the builder accumulates (`unknown | X` is `unknown`) and the scope
// would declare nothing at all; an opaque marker excludes cleanly instead, and
// `ValueOf` takes it back out.
//
// So `Passed` is a deliberate understatement. At runtime the inner answer comes
// back whole; the TYPE declines to say what it is, because at that point in the
// chain nothing truthful can be said. A step that only observes hands it
// straight on and never has to know. A step that DECORATES has to read it, and
// reading it means going through the carrier whose words are in there — one
// assertion, written once per carrier, never at each step (measured against a
// carrier of realistic size, §42).
declare const PASSED: unique symbol

export interface Passed {
  readonly [PASSED]?: true
}

// What a step calls to continue inward. Its parameter is what the step
// POPULATES — annotate it, and the builder knows; leave it bare, and it is told
// nothing (measured, above).
export type Next<Add extends object> = (delta: Add) => Promise<Passed>

// A step, as the author writes it — the formula, named. `R` is deliberately
// unconstrained: the three things a step may return have nothing in common but
// being values.
//
// `R` is also where the words live. A step returning `unauthorized()` has that
// word in its return TYPE, so the builder reads it by distributing over the
// whole return — never from inside a union constituent, where TypeScript picks
// the first candidate and rejects the rest.
//
// Nothing in the core is annotated with this — `.step` infers all four from the
// function it is given, which is the point. It is here to be READ, and to be
// the shape a carrier or an extension is written against.
export type Step<Need extends object, Req extends object, Add extends object, R> = (
  app: Need,
  ctx: Req,
  next: Next<Add>,
) => R | Promise<R>

// The ERASED runtime face. The fold composes steps it knows nothing about, so
// it holds them at their widest — every type claim was checked where the step
// was added.
export type AnyStep = (
  app: object,
  ctx: object,
  next: (delta: object) => Promise<Passed>,
) => unknown
