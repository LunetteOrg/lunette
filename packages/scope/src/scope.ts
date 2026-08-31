import type { Abort, Ok } from './abort.ts'
import {
  runSteps,
  type AnyStep,
  type Extension,
  type Next,
  type Outcome,
  type Verbs,
} from './step.ts'

// THE BASE BUILDER. One verb, `.step()`, and everything else is sugar to be
// written on top of it — `guard`, `validate`, `handle`, `extend` each earn
// their place against this or do not come back.
//
// The accumulated state lives in a type PARAMETER, not in phantoms read back
// through `Self`, and that choice was measured rather than argued
// (`research/parameterised-builder`): −54 instantiations per scope and −11 per
// step against the intersection form, with types down ~16%. The prediction was
// that rebuilding a state object at every `.step` would cost MORE; it is the
// intersection that is expensive, because `Self` gains a member per verb and
// every later read walks all of them, while a parameterised read is one indexed
// access.
//
// Two things follow, and both are why the form matters beyond the number:
//
//   A SCOPE IS THE FUNCTION THAT RUNS IT, from the first line, with no
//   transition and nothing to declare. A call signature can read `S`; it cannot
//   read `Self`, because `this` binds to the receiver of a METHOD call and
//   calling an object directly binds it to `void`. Under the old form the
//   builder had to become a concrete type before its call could be typed at
//   all, and a `closes` declaration was what triggered that — the fold has
//   always seen termination by itself at runtime.
//
//   `result` accumulates as a UNION. Under intersection it cannot: `A & B` over
//   a type that is not a key collapses, which is why the other union-valued
//   axes are maps of NAMES. So a guard that can hand back a domain value of its
//   own now appears in what the scope produces, where before it vanished.

// ── gate: the CHAIN does not expose what the scope demands ───────────────────
// `Need` (what the scope requires of the app) and `Pub` (what the chain
// exposes) are two independent inferred generics with no shared annotated slot,
// so contravariance cannot relate them and a brand is required. The conditional
// vanishes on success (`X & unknown` is `X`, and the argument is accepted
// unchanged) and becomes an unsatisfiable branded object on failure, so the
// error lands on the call naming the gap.
//
// `Pub extends Need` accepts a SUPERSET: a chain that exposes more than a scope
// requires is fine, and the extra singletons are ignored.
//
// The MOUNT-side gates — a host that cannot render an intent, a host that does
// not implement a capability — are not here. They cannot move earlier (the same
// scope is correct on another host) and they come back with the host mounts.
type DepGuard<Pub, Need> = Pub extends Need
  ? unknown
  : { readonly __ERROR_chain_Pub_missing_deps: Need }

// ── the accumulated state ────────────────────────────────────────────────────
// One object, one member per axis. Everything the builder knows is here, and
// nothing is read out of an intersection.
export interface State {
  // What the scope demands of the app — the chain, alive as long as the process
  // (§33 tier 1).
  readonly need: object
  // What a run brings — the scope execution parameters, the call's second
  // argument (§33 tier 2). NOT `seed`: wire already uses that word for the
  // build-once, which is the other lifetime.
  readonly seed: object
  // What the steps have populated so far.
  readonly acc: object
  // What the scope can YIELD: the union of the domain values its steps return.
  readonly result: unknown
  // Every word its steps can say, and every word its carrier coins. The two
  // sides `DeclGate` compares.
  readonly intents: PropertyKey
  readonly declares: PropertyKey
  // The verbs its extensions declared, as the BUILDER offers them — full
  // signatures, not the runtime factories. The two are different shapes and
  // constraining this to the factory map is a mistake that reads as harmless:
  // a concrete state then fails its own constraint, `S` falls back to `State`
  // wherever it is inferred, and every verb sees the widest possible scope
  // instead of the one it was called on.
  readonly verbs: object
}

// ── reading what a step handed back ──────────────────────────────────────────
// Of the three things a step may return, two contribute NO domain value: the
// outcome `next` gave it (it is passing through — the brand says so) and a WORD
// (it contributes on the intent axis instead). What is left is the value.
//
// KNOWN LIMIT, and deliberately not fixed here. `R extends AnyOutcome ? never`
// reads "it is passing through", but a WRAP step — one that awaits `next` and
// hands back `{ ...out, value: somethingElse }` — is also outcome-shaped, and
// its new value is dropped from `S['result']`. The scope then reports the
// leaf's type while producing the wrapper's. Narrowing this needs the outbound
// side to be a value a step RETURNS rather than an outcome it forwards, which
// is the shape #61 is already moving to; doing it twice is the work the design
// document exists to avoid.
type AnyOutcome = Outcome<unknown>
type AnyAbort = Abort<never> | Abort<any>
type ValueOf<R> = R extends AnyOutcome
  ? never
  : R extends AnyAbort
    ? never
    : R extends Ok<infer V, any>
      ? V
      : R

// The load-bearing shape on the intent axis, and why a step returns a WORD
// rather than a pre-built outcome. Inferring from INSIDE a union constituent
// (`(ctx) => E | Abort<I>`) makes TypeScript pick the first candidate and
// reject the rest, so a step that can return two different words stops
// compiling (§1). Infer the WHOLE return type and distribute afterwards.
//
// One conditional per case, not two: an outer `extends AnyAbort` guard around
// the `infer` would be redundant and paid for on every step.
type IntentKeysOf<R> = R extends Abort<infer I>
  ? keyof I
  : R extends Ok<any, infer I>
    ? keyof I
    : never

// ── gate: the SCOPE does not coin that word ──────────────────────────────────
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// and was tried first, but it only fires when the NEXT call in the chain
// touches the poisoned type — so a BASE (a carrier plus a few steps, no leaf,
// which is exactly the shape a shared `gated()` has in a real app) swallows the
// mistake and surfaces it in whichever file finally uses the scope, pointing at
// a step its author never wrote (§2).
//
// `A` and `U` are defaulted parameters used as let-bindings, so each is
// computed ONCE instead of per mention. They sit on the ALIAS, never on the
// method: a defaulted parameter in a method's own list is caller-overridable,
// and naming it `never` walks straight through the gate (§8).
type DeclGate<
  S extends State,
  Ret,
  A = Awaited<Ret>,
  U = Exclude<IntentKeysOf<A>, S['declares']>,
> = [U] extends [never]
  ? unknown
  : `⛔ this scope does not coin the word: ${U & string} — is it the right carrier?`

// The ctx a step reads: what the run was seeded with, plus everything the steps
// before it populated.
//
// An OVERRIDE, not the intersection it looks like (§9). `seed & acc` does not
// replace: a step re-populating a key it already has — which is what a
// refinement IS — would yield the intersection of the two types, and refining
// `Record<string, string | string[]>` to `{ page: number }` gives `never`. No
// error anywhere, just a field nobody can use, diagnosed two files away. `Omit`
// first, then intersect.
export type Ctx<S extends State> = Omit<S['seed'], keyof S['acc']> & S['acc']

// What a scope IS to whoever holds one: the callable builder, plus the verbs
// its extensions declared. The verbs are a plain record with no call signature
// of their own, so intersecting them creates no overload — which is what made
// the always-callable shape look impossible at first.
//
// A verb's signature is the extension's to write, and it is written with
// `this: Surface<S>`: that is how a verb reads the accumulated state without
// knowing it, and how it can GROW or REFINE the ctx. `this` binds here because
// this is a METHOD call — on the direct call above it binds to `void`, which is
// the whole reason the state lives in a parameter.
export type Surface<S extends State> = Scope<S> & S['verbs']

// ── gate: a verb may not take a name the surface already owns ────────────────
// `Surface` INTERSECTS, and that is exactly why this gate has to exist: `A & B`
// over a shared key does not conflict, it narrows, so a verb named `step`
// typechecks against the primitive it shadows and nothing is reported. The
// runtime is where it shows, silently and two ways — `.step(fn)` discards `fn`
// and pushes the verb's own step instead, and a verb named `name` or `length`
// throws from inside `.extend`, because a function's own properties are not
// writable. Both are configuration errors, so they belong at the call site that
// wrote them (principle 1).
//
// The alphabet is CLOSED and small on purpose: it is what the builder installs
// (`steps`, `step`, `extend`) plus what every function carries. Widening it is
// a claim about the surface, not a matter of taste.
//
// `U` is a defaulted parameter used as a let-binding, computed once, and it
// sits on the ALIAS rather than on the method — the same reason `DeclGate`'s
// does (§8).
type ReservedVerb = 'steps' | 'step' | 'extend' | 'name' | 'length' | 'prototype' | 'caller' | 'arguments'

type VerbGate<M, U = Extract<keyof M, ReservedVerb>> = [U] extends [never]
  ? unknown
  : `⛔ a verb cannot be named: ${U & string} — the scope's own surface owns it`

// How anything OUTSIDE the builder reads what a scope accumulated — a mount
// asking which words it can say, a test asking what it yields. Under the
// intersection form this needed a phantom per axis, present only so an adapter
// could see past the intersection; with the state in a parameter there is
// nothing to see past, and one conditional reads all of it.
//
// The phantoms are gone with it, and one of them was actively harmful: an
// INVARIANT `__int` blocked the inference of `S` from a verb's `this`, so a
// verb could not read the scope it was called on at all (the trap-4 family —
// an invariant position misbehaves in inference, not only in assignment).
export type StateOf<Sc> = Sc extends Scope<infer S> ? S : never
export type IntentsOf<Sc> = StateOf<Sc>['intents']
export type ResultOf<Sc> = StateOf<Sc>['result']

// What `.step` grows. An extension writes its own transformation instead —
// `Refined<S, N, T>` in the validation extension is one — which is how a verb
// can REPLACE an entry where a step can only add to it.
type Grown<S extends State, Need2 extends object, Add extends object, Ret> = Surface<{
  need: S['need'] & Need2
  seed: S['seed']
  acc: S['acc'] & Add
  result: S['result'] | ValueOf<Awaited<Ret>>
  intents: S['intents'] | IntentKeysOf<Awaited<Ret>>
  declares: S['declares']
  verbs: S['verbs']
}>

export interface Scope<S extends State> {
  // Two arguments, split by LIFETIME. The gates ride them, so a direct call is
  // checked exactly as a mount is.
  <Pub extends object>(
    app: Pub & DepGuard<Pub, S['need']>,
    params: S['seed'],
  ): Promise<Outcome<S['result']>>

  // The ordered stack the call folds.
  readonly steps: readonly AnyStep[]

  // THE PRIMITIVE, in the open, and the only verb. What a step says by
  // ANNOTATION — its app requirement, its ctx requirement, what it populates —
  // is read off the three parameters. What it says by VALUE — the verbs it
  // contributes — is read off the object form, and a step that says neither
  // stays a bare function.
  //
  // `ctx` is typed `Ctx<S>`, and that one position does the work an alphabet of
  // transport features was going to do. Under `strictFunctionTypes` a
  // function-typed parameter is contravariant, so a step ANNOTATING a wider ctx
  // than the scope holds is refused right here, at the argument, naming the
  // member that is missing. A step reading what the scope does not hold is not
  // a rule the core enforces — it is not expressible.
  //
  // `Ret` — what the step hands BACK — is unconstrained on purpose. A step may
  // return the outcome `next` gave it, a WORD from a carrier's vocabulary, or a
  // plain domain value, and those three have nothing in common but being
  // values. The fold normalises whichever arrives, so no author writes an
  // outcome by hand.
  step<Need2 extends object, Add extends object, Ret>(
    s: ((app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret>) & DeclGate<S, Ret>,
  ): Grown<S, Need2, Add, Ret>

  // Enrich the BUILDER, and only the builder: this pushes no step, and an
  // extension never appears in the step list. Its verbs do the fold work, when
  // they are called.
  extend<M extends object>(
    ext: Extension<M> & VerbGate<M>,
  ): Surface<{
    need: S['need']
    seed: S['seed']
    acc: S['acc']
    result: S['result']
    intents: S['intents']
    declares: S['declares']
    verbs: S['verbs'] & M
  }>
}

// A CARRIER is the thing you pick exactly one of: who is on the other end and
// what language it speaks. Chosen once, in `scope()`, and never a step — which
// is why there is no `.extend(carrier)`: `scope().extend(http).extend(rpc)` was
// expressible and failed only later, at the mount, by accident.
export interface Carrier {
  readonly __seed?: object
  readonly __declares?: object
}

type SeedOf<C> = C extends { readonly __seed?: infer T } ? (T extends object ? T : {}) : {}
// A non-string key is not dropped: dropping the only key leaves `never`, and a
// scope declaring `never` coins nothing, so every word is refused. That is
// fail-CLOSED and visible in the error, which is the direction §34 fixes.
type DeclaredOf<C> = C extends { readonly __declares?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never

// ── runtime ──────────────────────────────────────────────────────────────────
// The runtime knows nothing of any of this: it holds an ordered list of steps
// and a map of verbs, and every type claim was checked where the step was
// added.
interface Built {
  (app: object, params: object): Promise<Outcome<unknown>>
  readonly steps: readonly AnyStep[]
  step(s: AnyStep): Built
  extend(ext: { methods: Verbs }): Built
}

// The runtime half of `VerbGate`, for an extension assembled where the types
// were not checked — a plugin loaded by name, a `methods` map built from data,
// a caller in plain JS. It is a THROW and not a skip: a verb silently absent is
// the same silent degrade the gate exists to close, one call later.
const RESERVED_VERBS: ReadonlySet<string> = new Set([
  'steps',
  'step',
  'extend',
  'name',
  'length',
  'prototype',
  'caller',
  'arguments',
])

function make(steps: readonly AnyStep[], verbs: Verbs): Built {
  const fold = (app: object, params: object) => runSteps(steps, app, params)
  const self = Object.assign(fold, {
    steps,
    // One place where a step is added, and the only place a verb is registered,
    // so a step cannot contribute a verb without also running.
    // A step is added HERE and nowhere else, so nothing can join the fold
    // without being written as a step.
    step: (s: AnyStep): Built => make([...steps, s], verbs),
    // An extension registers verbs and adds NO step. That is the whole
    // difference, and it is visible in this line.
    extend: (ext: { methods: Verbs }): Built => make(steps, { ...verbs, ...ext.methods }),
  })
  // Every contributed verb, wired the same way: call it, get a step, push it.
  for (const [name, factory] of Object.entries(verbs)) {
    if (RESERVED_VERBS.has(name)) {
      throw new TypeError(
        `a verb cannot be named '${name}': the scope's own surface owns it. ` +
          `Reserved: ${[...RESERVED_VERBS].join(', ')}.`,
      )
    }
    ;(self as unknown as Record<string, unknown>)[name] = (...args: never[]) =>
      make([...steps, factory(...args)], verbs)
  }
  return self
}

type Empty<Seed extends object, Decl extends PropertyKey> = {
  need: {}
  seed: Seed
  acc: {}
  result: never
  intents: never
  declares: Decl
  verbs: {}
}

// Start a scope. The base is carrier-agnostic: nothing to read, no words to say,
// and it mounts everywhere by construction. `scope(carrier)` brings that
// carrier's run parameters and the words it coins.
export function scope<Seed extends object = {}>(): Surface<Empty<Seed, never>>
export function scope<C extends Carrier>(carrier: C): Surface<Empty<SeedOf<C>, DeclaredOf<C>>>
export function scope(_carrier?: Carrier): Surface<Empty<{}, never>> {
  // A carrier is PURE DECLARATION — it brings a vocabulary and the shape of a
  // run, and contributes no fold work at all. So there is nothing to inject
  // here, and the argument is read entirely at the type level.
  return make([], {}) as unknown as Surface<Empty<{}, never>>
}
