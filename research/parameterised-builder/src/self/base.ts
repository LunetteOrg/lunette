import type { Abort, Ok } from './abort.ts'
import type { DepGuard } from './adapter-guard.ts'
import {
  readStep,
  runSteps,
  type AnyStep,
  type AnyStepValue,
  type Next,
  type Outcome,
  type Verbs,
} from './primitive.ts'

// THE BASE BUILDER. One verb, `.step()`, and everything else is sugar to be
// written on top of it later — `guard`, `validate`, `handle`, `extend` each
// earn their place against this or do not come back.
//
// Every method takes an explicit `this: Self` so the accumulated state is read
// from an ordinary type parameter rather than a `this`-type query. That is the
// ONE idiom the whole builder follows.

// ── the phantom accumulators ─────────────────────────────────────────────────
// Covariant carriers, accumulated by INTERSECTION as steps are added.
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type NeedOf<T> = T extends { readonly __need?: infer N } ? (N extends object ? N : {}) : {}
// What the HOST hands over per run — the scope execution parameters. A base
// scope declares none, so it is `{}` and the call takes `{}`; a carrier fills
// it, and the shape of the call does not change when one arrives.
type SeedOf<T> = T extends { readonly __seed?: infer S } ? (S extends object ? S : {}) : {}

// ── what a scope PRODUCES, computed rather than declared ─────────────────────
// Of the three things a step may hand back, two contribute NO value: the
// outcome `next` returned (it is passing through — the brand says so) and a
// WORD (it contributes to the intent axis instead). What is left is the domain
// value, so `R` is the union of those across every step, read off their return
// types.
//
// This is why there is no termination declaration. `R` was the only thing one
// was needed for, and reading it this way is strictly MORE precise: a guard
// that can return `'anonymous'` appears in `R`, where reading the last step
// alone missed it. A scope whose steps all pass through has `R = never`, which
// is the honest statement that it produces nothing — and the reason running one
// throws rather than returning an empty success: `never` has no inhabitant.
type AnyAbort = Abort<never> | Abort<any>
// A step that PASSES THROUGH or returns a WORD contributes `unknown`, not
// `never`, and that is forced rather than chosen: `__result` accumulates across
// steps by INTERSECTION (the `Self &` idiom the whole builder rests on), and
// `never & X` is `never` while `unknown & X` is `X`. So the neutral element has
// to be `unknown`.
//
// THE LIMIT THIS LEAVES, and it is pinned by a test rather than hidden: two
// steps that each return a DOMAIN VALUE intersect instead of uniting —
// `'anonymous' & number` is `never`. An intersection cannot accumulate a union
// over a type that is not a key, which is what `__intents` and `__caps` get
// away with by being maps of NAMES. §9 names this exact shape as the one that
// "survives by accident", so it is written down, not relied on.
type ValueOf<R> = R extends AnyOutcome
  ? never
  : R extends AnyAbort
    ? never
    : R extends Ok<infer V, any>
      ? V
      : R

// ── the intent axis ──────────────────────────────────────────────────────────
// The load-bearing shape, and it is why a step returns a WORD rather than a
// pre-built outcome. Inferring the intent from INSIDE a union constituent
// (`(ctx) => E | Abort<I>`) makes TypeScript pick the first candidate and
// reject the rest, so a step that can return two different words stops
// compiling (§1). Infer the WHOLE return type and distribute afterwards, which
// collects every constituent instead.
//
// One conditional per case, not two: an outer `extends AnyAbort` guard around
// the `infer` would be redundant and paid for on every step.
type IntentKeysOf<R> = R extends Abort<infer I>
  ? keyof I
  : R extends Ok<any, infer I>
    ? keyof I
    : never

// Stored as a MAP so intersection accumulates across steps and `keyof` reads
// the union back.
type IntentMap<K extends PropertyKey> = { [P in K]: true }
type IntentsOf<T> = T extends { readonly __intents?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_INTENT_KEY'
  : never

// What the scope DECLARED, by being given a carrier that coins the word.
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never

// ── gate: the SCOPE does not have that word ──────────────────────────────────
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// and was tried first, but it only fires when the NEXT call in the chain
// touches the poisoned type — so a BASE (a carrier plus a few steps, no leaf,
// which is exactly the shape a shared `gated()` has in a real app) swallows the
// mistake and surfaces it in whichever file finally closes the builder,
// pointing at a step its author never wrote (§2).
//
// `A` and `U` are defaulted parameters used as let-bindings, so each is
// computed ONCE instead of per mention. They sit on the ALIAS, never on the
// method: a defaulted parameter in a method's own list is caller-overridable,
// and naming it `never` walks straight through the gate (§8).
type DeclGate<Self, Ret, A = Awaited<Ret>, U = Exclude<IntentKeysOf<A>, DeclaredOf<Self>>> = [
  U,
] extends [never]
  ? unknown
  : `⛔ this scope does not coin the word: ${U & string} — is it the right carrier?`

// The ctx a step reads: what the run was seeded with, plus everything the steps
// before it populated.
//
// An OVERRIDE, not the intersection it looks like (§9). `SeedOf & AccOf` does
// not replace: a step re-populating a key it already has — which is what a
// refinement IS — would yield the intersection of the two types, and refining
// `Record<string, string | string[]>` to `{ page: number }` gives `never`. No
// error anywhere, just a field nobody can use, diagnosed two files away. `Omit`
// first, then intersect.
export type Ctx<Self> = Omit<SeedOf<Self>, keyof AccOf<Self>> & AccOf<Self>

type AnyOutcome = Outcome<unknown>

// ── the closed form ──────────────────────────────────────────────────────────
// A SCOPE IS THE FUNCTION THAT RUNS IT. Two arguments, split by LIFETIME: the
// built chain, alive as long as the process (§33 tier 1), and the scope
// execution parameters — everything belonging to this one run (§33 tier 2).
// The word is not `seed`: wire already uses that for the build-once, which is
// the OTHER lifetime.
//
// WHY THIS IS A SEPARATE TYPE, and not a call signature on the builder itself.
// Making the builder callable was tried and does not work, for a reason that
// has nothing to do with termination: a `this` parameter binds to the RECEIVER
// OF A METHOD CALL, and calling an object directly (`h(app, params)`, not
// `h.m()`) binds `this` to `void` — measured. So a call signature cannot read
// the accumulated `Self`, and every axis the call depends on (`Need` for
// `DepGuard`, `Seed` for the parameters, `R` for the result) is invisible to
// it. Intersecting a fresh, concrete call signature per step does not rescue
// it either: two call signatures in an intersection become OVERLOADS, and the
// stale one is resolved first.
//
// The transition from an intersection-accumulated builder to a CONCRETE type is
// therefore what makes the call typed at all. That is what the closing step
// buys, and it is a better reason than the one it was introduced for.
export interface Handler<
  Need extends object,
  Seed extends object,
  R,
  Int extends PropertyKey = never,
> {
  <Pub extends object>(app: Pub & DepGuard<Pub, Need>, params: Seed): Promise<Outcome<R>>
  // The ordered stack the call folds, the terminal step included as its last.
  readonly steps: readonly AnyStep[]
  // Phantom and load-bearing: drop them and two handlers become structurally
  // identical, the adapter infers `unknown`, and the deps check stops being a
  // check without becoming an error.
  readonly __need?: (n: Need) => void
  readonly __result?: R
  // Phantom and INVARIANT — present in both positions on purpose. With only the
  // parameter it is contravariant, and a caller naming the type arguments at a
  // mount could supply `never` and satisfy a gate the scope still fails (§34,
  // on the capability axis; the same hole, the same shape).
  //
  // Every word this scope can produce — including one returned from a RAW step,
  // because the word rides the step's return TYPE and is no longer erased into
  // the outcome.
  readonly __int?: (i: Int) => Int
}

// The verbs a step contributes, as the BUILDER sees them — COMPUTED from each
// factory rather than declared beside it. A factory is `(...args) => a step`, so
// the method is `(...args) => the builder`: same arguments, and pushing the step
// is what the builder does with the result. A hand-written declaration was a
// duplicate of this argument list that could drift from it with no error.
//
// The verb returns `Self` unchanged: it pushes fold work and contributes no
// type-level state of its own. A verb that DOES contribute — an `.status(201)`
// pinning a literal for a host's codec — needs the factory's return type read
// as well, and that is not built (principle 5: no API without a case in hand).
type VerbsOn<M> = {
  readonly [K in keyof M]: M[K] extends (...args: infer A) => unknown
    ? <Self>(this: Self, ...args: A) => Self
    : never
}

// The verbs a step value carries, or none.
type VerbsIn<S> = S extends { readonly methods: infer M } ? (M extends Verbs ? M : {}) : {}

// A step that terminates CLOSES the builder into the concrete callable; one
// that does not GROWS it.
//
// Termination is read as the PRESENCE OF THE KEY, never as its value, and both
// halves of that are measured. Assigning `{ run, closes: true }` to a variable
// WIDENS the property to `boolean`; an absent `closes` also resolves to
// `boolean` through its constraint. By value the two are the same type, so a
// builder reading the value either refuses to close a real leaf or closes on
// every bare step.
//
// Which is also why `S`'s constraint is `{ run: unknown }` and names no other
// key: on the bare-function branch of the union `S` is unresolved and falls
// back to that constraint, so `keyof S` must not contain `closes`. It did, in
// the first shape, and a plain enriching step CLOSED THE BUILDER — the same
// fail-open a vacuous `extends` produces (§3), by a different road.
type Grown<Self, Need2 extends object, Add extends object, Ret, S> = 'closes' extends keyof S
  ? Handler<
      NeedOf<Self> & Need2,
      SeedOf<Self>,
      ValueOf<Awaited<Ret>>,
      IntentsOf<Self> | IntentKeysOf<Awaited<Ret>>
    >
  : Self & {
      readonly __need?: Need2
      readonly __acc?: Add
      readonly __intents?: IntentMap<IntentKeysOf<Awaited<Ret>> & PropertyKey>
    } & VerbsOn<VerbsIn<S>>

// A CARRIER is the thing you pick exactly one of: who is on the other end and
// what language it speaks. It is chosen once, in `scope()`, and is never a
// step — which is why there is no `.extend(carrier)`: `scope().extend(http)
// .extend(rpc)` was expressible and failed only later, at the mount, by
// accident.
export interface Carrier {
  // What a run brings — the scope execution parameters, the call's second
  // argument.
  readonly __seed?: object
  // The words it coins, read by `DeclGate` against what a step returned.
  readonly __declares?: object
}

export interface Scope {
  readonly __seed?: object
  readonly __acc?: object
  readonly __need?: object
  readonly __intents?: object
  readonly __declares?: object

  // THE PRIMITIVE, in the open, and the only verb. What a step declares by
  // ANNOTATION — its app requirement, its ctx requirement, what it populates —
  // is read off the three parameters. What it declares by VALUE — termination,
  // verbs — is read off the object form, and a step that declares neither stays
  // a bare function.
  //
  // `ctx` is typed `Ctx<Self>`, and that one position does the work an alphabet
  // of transport features was going to do. Under `strictFunctionTypes` a
  // function-typed parameter is contravariant, so a step ANNOTATING a wider ctx
  // than the scope has is refused right here, at the argument, with a message
  // naming the member that is missing. A step reading what the scope does not
  // hold is not a rule the core enforces — it is not expressible.
  //
  // A step that annotates NOTHING is contextually typed by this signature and
  // reads exactly what the scope holds, which is the inline case.
  // `Ret` — what the step hands BACK — is unconstrained on purpose. A step may
  // return the outcome `next` gave it, a WORD from a carrier's vocabulary, or a
  // plain domain value, and those three have nothing in common but being
  // values. The fold normalises whichever arrives, so no author ever writes an
  // outcome by hand.
  //
  // The parameter is a union, and both branches were measured to infer alike:
  // `ctx` is contextually typed inside the object literal exactly as it is on
  // the bare function, so writing the object form costs no annotation.
  step<Need2 extends object, Add extends object, Ret, S extends { run: unknown }, Self = this>(
    this: Self,
    s: (
      | ((app: Need2, ctx: Ctx<Self>, next: Next<Add>) => Ret | Promise<Ret>)
      | (S & { run: (app: Need2, ctx: Ctx<Self>, next: Next<Add>) => Ret | Promise<Ret> })
    ) &
      DeclGate<Self, Ret>,
  ): Grown<Self, Need2, Add, Ret, S>
}

// ── runtime ──────────────────────────────────────────────────────────────────
// The runtime CANNOT tell the two kinds of step apart and does not need to: it
// returns both faces at once — an object carrying `.step` that is also
// callable. Only the type picks one, and it picks it from the declaration.
interface Built {
  (app: object, params: object): Promise<Outcome<unknown>>
  readonly steps: readonly AnyStep[]
  step(s: AnyStepValue): Built
}

function make(steps: readonly AnyStep[], verbs: Verbs): Built {
  const fold = (app: object, params: object) => runSteps(steps, app, params)
  const self = Object.assign(fold, {
    steps,
    // One place where a step is added, and the only place a verb is registered,
    // so a step cannot contribute a verb without also running.
    step: (s: AnyStepValue): Built => {
      const { run, methods } = readStep(s)
      return make([...steps, run], { ...verbs, ...methods })
    },
  })
  // Every contributed verb, wired the same way: call it, get a step, push it.
  for (const [name, factory] of Object.entries(verbs)) {
    ;(self as unknown as Record<string, unknown>)[name] = (...args: never[]) => {
      const { run } = readStep(factory(...args) as AnyStepValue)
      return make([...steps, run], verbs)
    }
  }
  return self
}

// Start a scope. The base is carrier-agnostic: nothing to read, no words to
// abort with, and it mounts everywhere by construction.
//
// `Seed` is what a run brings — the scope execution parameters, the second
// argument of the call. A carrier DECLARES it; the base can be told it, which
// is what a scope with something to read but no protocol to speak looks like.
// It defaults to `{}`, so `scope()` is called with `{}` and the shape of the
// call does not change when a carrier arrives.
export function scope<Seed extends object = {}>(): Scope & { readonly __seed?: Seed }
export function scope<C extends Carrier>(carrier: C): Scope & C
export function scope(_carrier?: Carrier): Scope {
  // A carrier is PURE DECLARATION — it brings a vocabulary and the shape of a
  // run, and contributes no fold work at all. So there is nothing to inject
  // here, and the argument is read entirely at the type level.
  return make([], {}) as unknown as Scope
}
