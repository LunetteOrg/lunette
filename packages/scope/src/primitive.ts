import { isAbort, isOk, type Abort, type Ok } from './abort.ts'
import type { Invalid } from './carrier.ts'

// THE PRIMITIVE. A step wraps the rest of the fold: it reads `app` and the ctx
// as it stands, and either continues inward with what it populates or returns
// an outcome of its own and stops.
//
// A step says FIVE things, and where each one lives is the whole of this file:
//
//   what it knows of the app      the first parameter's type
//   what it knows of the ctx      the second parameter's type
//   what it populates             `next`'s parameter type — ANNOTATED, see below
//   what verbs it adds            `methods`, declared
//
// Three of the four ride positions the signature already has, so they are not
// declared twice and cannot drift from the code beside them. VERBS are the one
// declared thing, because contributing to the BUILDER's surface is a type-level
// claim that a runtime value cannot make on its own.
//
// TERMINATION is deliberately NOT among them — see below.
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

// A step, as the author writes it. `Need` is what it wants of the app, `Req`
// what it wants of the ctx, `Add` what it hands inward, `R` whatever it hands
// BACK — and `R` is deliberately unconstrained, because the three things a step
// may return have nothing in common but being values.
//
// `R` is also where the intents live. A step returning `unauthorized()` has
// that word in its return TYPE, so the builder reads it by distributing over
// the whole return (§1: never infer from inside a union constituent). While a
// step had to hand back a pre-built `Outcome` the word was cast away before the
// builder could see it, and a raw step contributed `never` — the fail-open this
// shape removes rather than documents.
export type Step<Need extends object, Req extends object, Add extends object, R> = (
  app: Need,
  ctx: Req,
  next: Next<Add>,
) => R | Promise<R>

// ── a step that also DECLARES is an object ───────────────────────────────────
// The one thing a step may say beyond its signature is an ordinary VALUE, not a
// phantom, which is what makes it readable and writable:
//
//   { run, methods: { header: … } }        it contributes verbs
//
// A step that says nothing stays a bare function, and that is the common case —
// nothing about writing one inline changes.
//
// A phantom was the first shape and it was worse in two ways. Verbs had to be
// declared in a hand-written `__methods` that duplicated the factory's argument
// list beside it and could drift from it; here the builder's signature is
// COMPUTED from the factory. And attaching a property to a FUNCTION needs
// `Object.assign` plus a cast — an object literal needs neither.
export type Verbs = Readonly<Record<string, (...args: never[]) => unknown>>

export interface StepValue<Run, M extends Verbs = Verbs> {
  readonly run: Run
  // Each verb is a function from its own arguments TO A STEP. It never receives
  // the builder or a callback to rebuild it: pushing the step is the core's
  // job, and it was the only thing any verb ever did with them.
  readonly methods?: M
}

// THERE IS NO TERMINATION DECLARATION, and that is a decision with a
// measurement behind it. A step that does not call `next` ends the fold, and
// the fold has always seen that at RUNTIME; a declaration was only ever needed
// so the TYPE could turn the builder into a callable, because a call signature
// cannot read state accumulated in an intersection (`this` binds to the
// receiver of a METHOD call, and calling an object directly binds it to
// `void`).
//
// Carrying that state in a type PARAMETER removes the need, and
// `research/parameterised-builder` measured what it costs: LESS — about −54
// instantiations per scope and −11 per step, types down ~16%. So the scope is
// callable and typed from the first line, `R` accumulates as a real union, and
// there is nothing to declare.
//
// What is left is the case where every step passes through and none produces a
// value. Such a scope has `R = never`, which has no inhabitant — there is no
// `ok` outcome to return, and a function whose return type is `never` is
// exactly one that does not return normally. So it THROWS, which the error
// convention agrees with (principle 3): a scope with no leaf, run, is a
// construction bug — infrastructure — and `{ ok: true, value: undefined }`
// would render a bug to the caller as a success.
//
// Note `Outcome<never>` is not empty: `abort` and `invalid` stay inhabited, so
// a base that REFUSES has a perfectly good outcome to hand back. Only the
// everything-passed-through path has none.

// The ERASED runtime face. The fold composes steps it knows nothing about, so
// it holds them at their widest — every type claim was already checked where
// the step was added.
export type AnyStep = (
  app: object,
  ctx: object,
  next: (delta: object) => Promise<Outcome<unknown>>,
) => unknown

// The erased face of either form, as the builder stores it.
export type AnyStepValue = AnyStep | { readonly run: AnyStep; readonly methods?: Verbs }

// Both forms reduce to the same two things. One place, so nothing downstream
// has to know which was written.
export function readStep(s: AnyStepValue): { run: AnyStep; methods: Verbs } {
  return typeof s === 'function' ? { run: s, methods: {} } : { run: s.run, methods: s.methods ?? {} }
}

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

