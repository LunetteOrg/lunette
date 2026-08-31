import { isAbort, isOk, type Abort, type Ok } from './abort.ts'

// What a failed parse says. A TYPE, not a vocabulary word: every carrier can
// have one, so it belongs to the outcome rather than to any carrier.
//
// WRITTEN OUT, not imported from `@standard-schema/spec`, and the distinction
// is the same one the rest of the core makes. The third branch of an `Outcome`
// has to be renderable by a mount that knows nothing about who produced it, so
// the core does need ONE issue shape — that much is mechanism. What it does not
// need is a third party's: naming Standard Schema's here made the core neutral
// about the schema ENGINE (an extension may run any) while not neutral about
// the issue SHAPE, so an extension validating with something else had to
// produce that library's type anyway.
//
// Structurally it IS that type, verified assignable both ways, so
// `@lntt/scope/standard-schema` hands its issues over without a cast. The
// difference is which package owns the contract a mount codes against: this one
// changes when we change it, not when a spec revs. And the `.` subpath stops
// pulling a dependency into the program of anyone who validates with something
// else — the extension keeps it, because it genuinely runs `~standard.validate`.
interface PathSegment {
  readonly key: PropertyKey
}

export interface Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
}

// The fold failing ON ITS OWN: the input did not validate. Deliberately NOT an
// abort — an abort is a word from a carrier's vocabulary and the core has none,
// so minting one here would be exactly the kind of vocabulary word this design
// keeps out of the core. Its own branch instead, so a codec that forgets it
// fails to COMPILE rather than silently mishandling it.
export interface Invalid {
  readonly issues: readonly Issue[]
}

// THE PRIMITIVE. A step wraps the rest of the fold: it reads `app` and the ctx
// as it stands, and either continues inward with what it populates or returns
// an outcome of its own and stops.
//
// A step says FIVE things, and where each one lives is the whole of this file:
//
//   what it knows of the app      the first parameter's type
//   what it knows of the ctx      the second parameter's type
//   what it populates             `next`'s parameter type — ANNOTATED, see below
//
// All three ride positions the signature already has, so a step is a plain
// FUNCTION and declares nothing at all. Enriching the BUILDER is a different
// axis and a different verb — see `Extension` below — and TERMINATION is
// deliberately not among them either, for the reason further down.
//
// What it populates is a third case, and it cost a measurement: it is NOT
// inferable from the `next(...)` calls in the body. `Add` occurs only in a
// parameter position of `next`, so a step written `(app, ctx, next) => next({
// user })` infers `Add` as the bare constraint `object` and populates NOTHING
// as far as the builder is concerned. Annotating the parameter —
// `next: Next<{ user: User }>` — infers it exactly. So the annotation is the
// declaration, and it sits on the parameter it describes rather than in a
// phantom beside it.

// ── what an author WRITES, and what the fold PRODUCES ────────────────────────
// These are two different things, and conflating them is what made the raw
// primitive unwritable. A step returns whichever of these it has to hand:
//
//   the result of `next(...)`   — the fold's own outcome, passed back out
//   a WORD from a carrier       — `unauthorized()`, `redirect('/')`: it stops
//   a plain domain value        — the leaf's ordinary case
//
// and the fold NORMALISES whatever came back. So no step ever writes
// `{ ok: true, value, intent: undefined }` by hand, no step casts a real word
// down to `Abort<never>` to make it fit, and the shape a raw step is written in
// is the same shape the sugar has always offered. The sugar stops being the
// only way to write something readable.
//
// Telling the three apart needs no guessing: the fold's outcome is BRANDED, so
// "did this come back from `next`?" is a symbol check and not a heuristic over
// a shape a domain value could happen to have (principle 7 — no ambient magic).

// ── the outcome ──────────────────────────────────────────────────────────────
// THREE branches. `invalid` is the fold failing on its own (§40): a separate
// branch rather than an abort with a neutral name, so a codec that forgets it
// fails to COMPILE instead of quietly dropping it.
//
// `intent` is a WORD FROM A CARRIER'S VOCABULARY, and the core never reads what
// one MEANS — only whether it is there. On the `ok` branch it is what a success
// word carries: `json(v, 201)` says "render this as JSON with a 201", and a
// codec renders it. A leaf that returns a plain domain value says nothing about
// how it should be rendered, and the host's default applies.
//
// So it is OPTIONAL, and that is a change of ergonomics rather than of meaning.
// While the only producer was `runLeaf`, "required" cost nothing — one place
// wrote `intent: undefined` and no user ever saw it. With the primitive in the
// open a step writes its own outcome by hand, and a required field means every
// hand-written `ok` carries `intent: undefined`, which reads as a value that
// matters and is not one. Omitting it and carrying one are the same statement;
// the second is for a step that has a word to say.
//
// There is no `effects`. The outbound side is a RETURNED value — a step that
// decorates what comes back wraps `next` and modifies the outcome — so there is
// no sink to collect and nothing to carry beside the result.
export const OUTCOME: unique symbol = Symbol('scope.outcome')

type Branded = { readonly [OUTCOME]: true }

export type Outcome<R> = Branded &
  (
    | { readonly ok: true; readonly value: R; readonly intent?: unknown }
    | { readonly ok: false; readonly abort: Abort<never> }
    | { readonly ok: false; readonly invalid: Invalid }
  )

// The core's OWN branch, and the one word it does coin (§40): the input did not
// validate. It is not an abort — an abort is a word from a carrier's
// vocabulary, and the core has none — so it is its own branch, and a codec that
// forgets it fails to compile rather than quietly dropping it.
export const invalid = (issues: Invalid['issues']): Outcome<never> => ({
  [OUTCOME]: true,
  ok: false,
  invalid: { issues },
})

// What a step calls to continue inward. Its parameter is what the step
// POPULATES — annotate it, and the builder knows; leave it bare, and the
// builder is told nothing (measured, above).
export type Next<Add extends object> = (delta: Add) => Promise<Outcome<unknown>>

// A step, as the author writes it — the formula, named. `Need` is what it wants
// of the app, `Req` what it wants of the ctx, `Add` what it hands inward, `R`
// whatever it hands BACK, and `R` is deliberately unconstrained because the
// three things a step may return have nothing in common but being values.
//
// `R` is also where the words live. A step returning `unauthorized()` has that
// word in its return TYPE, so the builder reads it by distributing over the
// whole return (§1: never infer from inside a union constituent). While a step
// had to hand back a pre-built `Outcome` the word was cast away before the
// builder could see it, and a raw step contributed `never` — the fail-open this
// shape removes rather than documents.
//
// Nothing in the core is annotated with this: `.step` infers all four from the
// function it is given, which is the point. It is here to be READ, and to be
// the shape a carrier or an extension is written against.
export type Step<Need extends object, Req extends object, Add extends object, R> = (
  app: Need,
  ctx: Req,
  next: Next<Add>,
) => R | Promise<R>

// ── an EXTENSION enriches the BUILDER, and only the builder ──────────────────
// Two verbs, two axes, and the split is the whole of it:
//
//   `.step(fn)`      acts on the FLOW. It is a bare function, always.
//   `.extend(ext)`   acts on the BUILDER. It pushes no step at all.
//
// An extension contributes VERBS, and a verb is a function from its own
// arguments TO A STEP — so the fold work happens when the verb is CALLED, not
// when the extension is added. That is why `.extend` needs no step of its own,
// and it is not a second primitive: `.step` remains the only thing that ever
// adds to the fold, and an extension never appears in the step list.
//
// The evidence for the split is that the two never co-occur. Of the ten
// extensions the previous core shipped, five did fold work and contributed no
// verb, two contributed verbs and did no fold work, two were carriers doing
// neither — and the ONE that did both was the response-header sink, which the
// returned-response decision retired. `{ run, methods }` was a shape nobody
// used.
//
// **The signatures are DECLARED, not computed**, and that reverses a choice
// made earlier the same day. Computing them from the factory removes a
// duplicate, which is a real gain — but `infer` through a GENERIC factory
// instantiates its type parameters to their constraints, and the verbs that
// matter are all generic. Measured, side by side:
//
//   declared     `.status(201)` → `{ pinned: 201 }`      ✓
//   computed     `.status(201)` → `{ pinned: number }`   ✗
//
// `validate` loses more than a literal: it loses the entry's name AND the
// schema's output type, which is its entire job. So the duplicate stays, and
// what it buys is that a verb can be generic at all.
//
// What the duplicate costs is drift, and `Extension` ties the two sides by NAME
// so half of it cannot happen: every declared verb must have a factory, and a
// factory that no verb declares is refused.
export type Verbs = Readonly<Record<string, (...args: never[]) => AnyStep>>

export interface Extension<M extends object> {
  // One factory per declared verb, keyed alike. A factory never receives the
  // builder or a callback to rebuild it: pushing the step is the core's job,
  // and it was the only thing any verb ever did with them.
  readonly methods: { readonly [K in keyof M]: (...args: never[]) => AnyStep }
  // The signatures, as the BUILDER offers them. Each is written with
  // `this: Surface<S>` so it reads the scope's accumulated state off the
  // receiver — which works here and not on the callable, because `this` binds
  // on a METHOD call and not on a direct one.
  readonly __methods?: M
}

// The ERASED runtime face. The fold composes steps it knows nothing about, so
// it holds them at their widest — every type claim was already checked where
// the step was added.
export type AnyStep = (
  app: object,
  ctx: object,
  next: (delta: object) => Promise<Outcome<unknown>>,
) => unknown

// The ONE place any of the three becomes an outcome. It runs on the way back
// from every step, so an author never calls it and never sees it — which is the
// whole point: the erasure of a word's intent down to `Abort<never>` happens
// here, once, on a value already typed `unknown`, instead of at each call site
// on a value whose type still said what the word was.
export function outcomeOf(result: unknown): Outcome<unknown> {
  if (isOutcome(result)) return result
  if (isAbort(result)) return { [OUTCOME]: true, ok: false, abort: result as Abort<never> }
  if (isOk(result)) {
    const ok = result as Ok<unknown, never>
    return { [OUTCOME]: true, ok: true, value: ok.value, intent: ok.intent }
  }
  return { [OUTCOME]: true, ok: true, value: result }
}

const isOutcome = (x: unknown): x is Outcome<unknown> =>
  typeof x === 'object' && x !== null && OUTCOME in x

// ── the fold ─────────────────────────────────────────────────────────────────
// ONE ordered list, folded from the outside in. Nothing decides which category
// runs first because there are no categories: everything is a step and every
// step runs where it was written.
//
// `async` is a contract and not a style: a step may throw SYNCHRONOUSLY (a
// construction bug says so by throwing — infrastructure, by the error
// convention), and a plain function would let that escape past the promise the
// callable promises to return.
export async function runSteps(
  steps: readonly AnyStep[],
  app: object,
  ctx: object,
): Promise<Outcome<unknown>> {
  const at = async (i: number, seen: object): Promise<Outcome<unknown>> => {
    const step = steps[i]
    if (step === undefined) {
      // Unreachable through the API: the builder only becomes callable when a
      // step DECLARED that it terminates, so a stack that runs off the end was
      // assembled by hand. A construction bug is infrastructure — it throws.
      // `R` is `never` for a scope whose steps all pass through, and `never`
      // has no inhabitant — there is no `ok` outcome to hand back. A function
      // whose return type is `never` is exactly one that does not return
      // normally, so this is not a fallback beside the type: it is the type.
      //
      // By the error convention (principle 3) it is also the right branch: a
      // scope with no leaf, run, is a CONSTRUCTION bug — infrastructure — and
      // `{ ok: true, value: undefined }` would render a bug to the caller as a
      // success. Note the other two branches stay reachable: a base that
      // REFUSES has a perfectly good outcome, and only the
      // everything-passed-through path has none.
      throw new Error(
        '@lntt/scope: every step passed through and none produced a value — this scope has no leaf',
      )
    }
    // NORMALISED on the way out, so every step may hand back whichever of the
    // three it has: the outcome `next` returned, a word, or a domain value.
    return outcomeOf(await step(app, seen, (delta) => at(i + 1, { ...seen, ...delta })))
  }
  return at(0, ctx)
}

