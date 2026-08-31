import type { Abort } from './words.ts'

// What a failed parse says. A TYPE, not a vocabulary word: every carrier can
// have one, so it belongs to the outcome rather than to any carrier.
//
// Written out rather than imported from `@standard-schema/spec`: the third
// branch of an `Outcome` has to be renderable by a mount that knows nothing
// about who produced it, so the core needs ONE issue shape — but not a third
// party's. Naming that one made the core neutral about the schema ENGINE and
// not about the issue SHAPE. Structurally it IS that type, assignable both
// ways, so `@lntt/scope/standard-schema` hands its issues over without a cast.
interface PathSegment {
  readonly key: PropertyKey
}

export interface Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
}

// The fold failing ON ITS OWN: the input did not validate. Deliberately not an
// abort — an abort is a word from a carrier's vocabulary and the core has none
// (§40). Its own branch instead, so a codec that forgets it fails to COMPILE
// rather than silently mishandling it.
export interface Invalid {
  readonly issues: readonly Issue[]
}

// THE PRIMITIVE. A step wraps the rest of the fold: it reads `app` and the ctx
// as it stands, and either continues inward with what it populates or returns
// an outcome of its own and stops.
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

// ── the outcome ──────────────────────────────────────────────────────────────
// THREE branches, and what an author WRITES is not this. A step returns
// whichever it has to hand — the result of `next(...)`, a WORD from its carrier
// (`unauthorized()`, `redirect('/')`), or a plain domain value — and the fold
// normalises it. So no step builds an outcome and none casts a word down to
// `Abort<never>` to make it fit.
//
// Telling the three apart needs no guessing: the fold's outcome is BRANDED, so
// "did this come back from `next`?" is a symbol check and not a heuristic over
// a shape a domain value could happen to have (principle 7).
//
// `intent` is a word from a carrier's vocabulary and the core never reads what
// one MEANS, only whether it is there. It is OPTIONAL because omitting it and
// carrying one are the same statement: a leaf returning a plain value says
// nothing about rendering and the host's default applies, while `json(v, 201)`
// has something to say. A required field would put `intent: undefined` on every
// hand-written `ok`, which reads as a value that matters and is not one.
export const OUTCOME: unique symbol = Symbol('scope.outcome')

type Branded = { readonly [OUTCOME]: true }

export type Outcome<R> = Branded &
  (
    | { readonly ok: true; readonly value: R; readonly intent?: unknown }
    | { readonly ok: false; readonly abort: Abort<never> }
    | { readonly ok: false; readonly invalid: Invalid }
  )

// The core's own branch, and the one word it does coin (§40).
export const invalid = (issues: Invalid['issues']): Outcome<never> => ({
  [OUTCOME]: true,
  ok: false,
  invalid: { issues },
})

// What a step calls to continue inward. Its parameter is what the step
// POPULATES — annotate it, and the builder knows; leave it bare, and it is told
// nothing (measured, above).
export type Next<Add extends object> = (delta: Add) => Promise<Outcome<unknown>>

// A step, as the author writes it — the formula, named. `R` is deliberately
// unconstrained: the three things a step may return have nothing in common but
// being values.
//
// `R` is also where the words live. A step returning `unauthorized()` has that
// word in its return TYPE, so the builder reads it by distributing over the
// whole return (§1: never infer from inside a union constituent).
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
  next: (delta: object) => Promise<Outcome<unknown>>,
) => unknown
