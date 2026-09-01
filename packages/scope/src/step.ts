
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
// TWO branches, and what an author WRITES is not this. A step returns
// whichever it has to hand — the result of `next(...)`, a WORD from its carrier
// (`unauthorized()`, `redirect('/')`), or a plain domain value — and the fold
// normalises it. So no step builds an outcome and none casts a word down to
// `Abort<never>` to make it fit.
//
// Telling the three apart needs no guessing: the fold's outcome is BRANDED, so
// "did this come back from `next`?" is a symbol check and not a heuristic over
// a shape a domain value could happen to have.
//
// `intent` is a word from a carrier's vocabulary and the core never reads what
// one MEANS, only whether it is there. It is OPTIONAL because omitting it and
// carrying one are the same statement: a leaf returning a plain value says
// nothing about rendering and the host's default applies, while `json(v, 201)`
// has something to say. A required field would put `intent: undefined` on every
// hand-written `ok`, which reads as a value that matters and is not one.
// Registered for the same reason the word brands are — see `words.ts`.
export const OUTCOME: unique symbol = Symbol.for('lntt.scope.outcome')

type Branded = { readonly [OUTCOME]: true }

export type Outcome<R> = Branded &
  (
    | { readonly ok: true; readonly value: R; readonly intent?: unknown }
    | { readonly ok: false; readonly intent: unknown }
  )

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
  next: (delta: object) => Promise<Outcome<unknown>>,
) => unknown
