import type { Word } from './words.ts'
import type { AnyStep, Next, Passed } from './step.ts'

// THE BASE BUILDER. One verb, `.step()`, and everything else is sugar written
// on top of it.
//
// The accumulated state lives in a type PARAMETER, not in phantoms read back
// through `Self`, and the choice is measured (`research/parameterised-builder`):
// −54 instantiations per scope and −11 per step against the intersection form,
// types down ~16%. The intersection is the expensive one — `Self` gains a member
// per verb and every later read walks all of them, while a parameterised read is
// one indexed access.
//
// Two things follow, and they matter more than the number:
//
//   A SCOPE IS THE FUNCTION THAT RUNS IT, from the first line. A call signature
//   can read `S`; it cannot read `Self`, because `this` binds to the receiver of
//   a METHOD call and calling an object directly binds it to `void`.
//
//   `result` accumulates as a UNION. Under intersection it cannot: `A & B` over
//   a type that is not a key collapses, which is why the other union-valued axes
//   are maps of NAMES.

// ── gate: the CHAIN does not expose what the scope demands ───────────────────
// `Need` and `Pub` are two independently inferred generics with no shared
// annotated slot, so contravariance cannot relate them and a brand is required.
// The conditional vanishes on success (`X & unknown` is `X`) and becomes an
// unsatisfiable branded object on failure, so the error lands on the call.
//
// A SUPERSET is fine: a chain exposing more than the scope requires passes.
//
// The MOUNT-side gates are not here — the same scope is correct on another
// host, so they cannot move earlier. They come with the host mounts.
type DepGuard<Pub, Need> = Pub extends Need
  ? unknown
  : { readonly __ERROR_chain_Pub_missing_deps: Need }

// ── the accumulated state ────────────────────────────────────────────────────
// One object, one member per axis. Everything the builder knows is here, and
// nothing is read out of an intersection.
export interface State {
  // What the scope demands of the app — the chain, alive as long as the
  // process.
  readonly need: object
  // What a run brings — the scope execution parameters, the call's second
  // argument. NOT `seed`: that word is wire's build-once, the
  // OTHER lifetime, and naming this one after it collapses the distinction the
  // two tiers exist to make. Not `params` either — that is the name of an entry
  // a carrier puts INSIDE this one, and `params.params` is what that reads as.
  readonly args: object
  // What the steps have populated so far.
  readonly acc: object
  // What the scope can YIELD: the union of everything its steps return, words
  // included — with one channel there is nowhere else for them to be (§42).
  readonly returns: unknown
  // The two sides `ReturnGate` compares, and they are supply and demand.
  // `vocabulary` is what the carrier COINS — every word this scope may say,
  // whether or not anything says it. `intents` is what the steps written so far
  // actually SAY, accumulated at every `.step`. What you MAY say, against what
  // you HAVE said: the first gates a step as it is written, the second is what
  // a mount asks about, to know whether it can render them all.
  readonly vocabulary: PropertyKey
  // The verbs its extensions declared, as the BUILDER offers them — full
  // signatures, not the runtime factories. Constraining this to the factory map
  // reads as harmless and is not: a concrete state then fails its own
  // constraint, `S` falls back to `State` wherever it is inferred, and every
  // verb sees the widest possible scope instead of the one it was called on.
  readonly verbs: object
}

// ── reading what a step handed back ──────────────────────────────────────────
// The fold hands back what the leaf returned, so what a scope YIELDS is the
// union its steps accumulated — words included, since a word is a value like
// any other and the core has no branch to put it on. The one thing taken out is
// the marker `next` returns: that is machinery, and no consumer should see it.
//
// One projection, therefore, where the two-branch shape needed two. "What does
// this scope produce" and "what can it hand back at all" stopped being
// different questions when the branch went (§42).
export type ValueOf<R> = Exclude<R, Passed>

// The load-bearing shape on the intent axis. Inferring from INSIDE a union
// constituent (`(ctx) => E | Refusal`) makes TypeScript pick the first
// candidate and reject the rest, so a step that can return two different words
// stops compiling. Infer the WHOLE return type and distribute afterwards.
type IntentKeysOf<R> = R extends Word<infer I> ? keyof I : never

// ── gate: what the step HANDS BACK ───────────────────────────────────────────
// Two things are checked about one type, so they share the `Awaited` — measured
// at 2% of the pair's cost, and the pair is 7% of a chain's total.
//
// FIRST, a step that returns nothing. Forgetting `return` in front of `next(…)`
// is silent and plausible: the inner steps run, the leaf computes its value,
// and the fold hands back the wrapper's `undefined` instead — which is an
// ordinary domain value, so nothing downstream notices. A function with no
// `return` at all infers `void`, while `return undefined` infers `undefined`,
// and the two are distinct here — so a leaf that really has nothing to hand
// back says so and passes, and `null` is a domain value that never reaches the
// check. The gap: a step returning on one path and falling off the other infers
// `T | undefined`, not `void`, and passes. Catching that would refuse every
// legitimate result that can be absent.
//
// Without this the mistake still surfaces, but as `string | void` at whoever
// consumes the result — in another file, pointing at a step its author never
// wrote, and not at all in a test that only checks the happy value.
//
// SECOND, a word the scope does not coin.
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// but only fires when the NEXT call touches the poisoned type, so a BASE — a
// carrier and some steps with no leaf, the shape a shared `gated()` has —
// swallows the mistake and surfaces it in whichever file finally uses the
// scope, pointing at a step its author never wrote.
//
// `A` and `U` are let-bindings computed once. They sit on the ALIAS, never on
// the method: a defaulted parameter in a method's own list is caller-
// overridable, and naming it `never` walks straight through the gate.
type ReturnGate<
  S extends State,
  Ret,
  A = Awaited<Ret>,
  U = Exclude<IntentKeysOf<A>, S['vocabulary']>,
> = [A] extends [void]
  ? [A] extends [undefined]
    ? unknown
    : '⛔ this step returns nothing — did you forget `return` in front of `next(…)`?'
  : [U] extends [never]
    ? unknown
    : `⛔ this scope does not coin the word: ${U & string} — is it the right carrier?`

// ── the ctx a step reads ─────────────────────────────────────────────────────
// The arguments the run was given, plus everything the steps before it
// populated.
//
// An OVERRIDE, not the intersection it looks like. `args & acc` does not
// replace, and re-populating a key is what a REFINEMENT is: narrowing
// `Record<string, string | string[]>` to `{ page: number }` would intersect to
// `never` — a field nobody can use, with no error anywhere. `Omit` first.
export type Ctx<S extends State> = Omit<S['args'], keyof S['acc']> & S['acc']

// What a scope IS to whoever holds one: the callable builder, plus the verbs its
// extensions declared. The verbs are a plain record with no call signature of
// their own, so intersecting them creates no overload.
//
// A verb's signature is the extension's to write, with `this: Surface<S>` — how
// it reads the accumulated state without knowing it, and how it can GROW or
// REFINE the ctx. `this` binds on a METHOD call; on the callable above it binds
// to `void`, which is why the state lives in a parameter.
export type Surface<S extends State> = Scope<S> & S['verbs']

// ── gate: a verb may not take a name the surface already owns ────────────────
// `Surface` INTERSECTS, which is why this gate has to exist: `A & B` over a
// shared key does not conflict, it narrows, so a verb named `step` typechecks
// against the primitive it shadows and nothing is reported. It shows only at
// runtime, two ways — `.step(fn)` discards `fn` and pushes the verb's step
// instead, and a verb named `name` or `length` throws from inside `.extend`,
// because a function's own properties are not writable.
//
// The alphabet is CLOSED, and closing it takes BOTH halves of what a function
// carries: its OWN properties (`name`, `length`, `prototype`, `caller`,
// `arguments`), where assignment throws and the failure is at least loud, and
// what it INHERITS from `Function.prototype` (`bind`, `call`, `apply`,
// `toString`, `constructor`), where assignment quietly succeeds and shadows.
// The second half is the silent one: a verb named `bind` installs an own
// property over `Function.prototype.bind`, so `myScope.bind(null, app)` hands
// back a step-pushing builder instead of a bound function, and a verb named
// `toString` makes `String(scope)` throw `Cannot convert object to primitive
// value` from wherever the scope is interpolated.
//
// `U` sits on the ALIAS, not the method, for the reason `ReturnGate`'s does —
// a defaulted parameter in a method's own list is caller-overridable.
type ReservedVerb =
  | 'steps'
  | 'step'
  | 'extend'
  | 'name'
  | 'length'
  | 'prototype'
  | 'caller'
  | 'arguments'
  | 'bind'
  | 'call'
  | 'apply'
  | 'toString'
  | 'constructor'

type VerbGate<M, U = Extract<keyof M, ReservedVerb>> = [U] extends [never]
  ? unknown
  : `⛔ a verb cannot be named: ${U & string} — the scope's own surface owns it`

// How anything OUTSIDE the builder reads what a scope accumulated — a mount
// asking which words it can say, a test asking what it yields. With the state in
// a parameter, one conditional reads all of it; the per-axis phantoms this
// replaced were not merely redundant, an INVARIANT one blocked the inference of
// `S` from a verb's `this` altogether.
export type StateOf<Sc> = Sc extends Scope<infer S> ? S : never
export type IntentsOf<Sc> = IntentKeysOf<StateOf<Sc>['returns']>
export type ResultOf<Sc> = ValueOf<StateOf<Sc>['returns']>

// What `.step` grows. An extension writes its own transformation instead —
// `Refined<S, N, T>` in the validation extension is one — which is how a verb
// can REPLACE an entry where a step can only add to it.
type Grown<S extends State, Need2 extends object, Add extends object, Ret> = Surface<{
  need: S['need'] & Need2
  args: S['args']
  acc: S['acc'] & Add
  returns: S['returns'] | Awaited<Ret>
  vocabulary: S['vocabulary']
  verbs: S['verbs']
}>

// ── an EXTENSION enriches the BUILDER, and only the builder ──────────────────
//   `.step(fn)`      acts on the FLOW    — the step list grows
//   `.extend(ext)`   acts on the BUILDER — it does not
//
// A verb is a function from its own arguments TO A STEP, so the fold work
// happens when the verb is CALLED. `.step` stays the only thing that adds to
// the fold, which is why this is not a second primitive.
//
// The signatures are DECLARED, not computed from the factory: `infer` through a
// GENERIC factory instantiates its type parameters to their constraints, and
// the verbs that matter are all generic.
//
//   declared   `.status(201)` → `{ pinned: 201 }`      ✓
//   computed   `.status(201)` → `{ pinned: number }`   ✗
//
// A verb that REFINES an entry loses more than a literal that way — the entry's
// name AND the schema's output type, which is its whole job. The duplicate
// that buys this is tied by NAME below, so a verb with no factory — or a factory
// no verb declares — is an error here.
export type Verbs = Readonly<Record<string, (...args: never[]) => AnyStep>>

export interface Extension<M extends object> {
  // One factory per declared verb, keyed alike. A factory never receives the
  // builder or a callback to rebuild it: pushing the step is the core's job.
  readonly methods: { readonly [K in keyof M]: (...args: never[]) => AnyStep }
  // The signatures as the BUILDER offers them, each written with
  // `this: Surface<S>`. That works on a METHOD call and not on the callable,
  // where `this` binds to `void`.
  readonly __methods?: M
}

export interface Scope<S extends State> {
  // Two arguments, split by LIFETIME. The gates ride them, so a direct call is
  // checked exactly as a mount is.
  <Pub extends object>(
    app: Pub & DepGuard<Pub, S['need']>,
    args: S['args'],
  ): Promise<ValueOf<S['returns']>>

  // The ordered stack the call folds.
  readonly steps: readonly AnyStep[]

  // THE PRIMITIVE, and the only verb. Everything a step says rides the three
  // parameters — what it needs of the app, what it reads of the ctx, what it
  // populates — so a step is a bare function and declares nothing.
  //
  // `ctx` is typed `Ctx<S>`, and that one position does the work an alphabet of
  // transport features was going to do. Under `strictFunctionTypes` a
  // function-typed parameter is contravariant, so a step ANNOTATING a wider ctx
  // than the scope holds is refused right here, naming the missing member. A
  // step reading what the scope has not got is not a rule the core enforces — it
  // is not expressible.
  //
  // `Ret` is unconstrained on purpose: the three things a step may return have
  // nothing in common but being values, and the fold normalises whichever
  // arrives.
  step<Need2 extends object, Add extends object, Ret>(
    s: ((app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret>) &
      ReturnGate<S, Ret>,
  ): Grown<S, Need2, Add, Ret>

  // Enrich the BUILDER, and only the builder: this pushes no step, and an
  // extension never appears in the step list. Its verbs do the fold work, when
  // they are called.
  extend<M extends object>(
    ext: Extension<M> & VerbGate<M>,
  ): Surface<{
    need: S['need']
    args: S['args']
    acc: S['acc']
    returns: S['returns']
    vocabulary: S['vocabulary']
    verbs: S['verbs'] & M
  }>
}

// A CARRIER is the thing you pick exactly one of: who is on the other end and
// what language it speaks. Chosen once, in `scope()`, and never a step — which
// is why there is no `.extend(carrier)`: `scope().extend(http).extend(rpc)` was
// expressible and failed only later, at the mount, by accident.
export interface Carrier {
  readonly __args?: object
  readonly __vocabulary?: object
}

type ArgsOf<C> = C extends { readonly __args?: infer T } ? (T extends object ? T : {}) : {}
// A non-string key is not dropped: dropping the only key leaves `never`, and a
// scope declaring `never` coins nothing, so every word is refused. That is
// fail-CLOSED and visible in the error.
type VocabularyOf<C> = C extends { readonly __vocabulary?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never

// ── runtime ──────────────────────────────────────────────────────────────────
// The runtime knows nothing of any of this: it holds an ordered list of steps
// and a map of verbs, and every type claim was checked where the step was
// added.
interface Built {
  (app: object, params: object): Promise<unknown>
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
  'bind',
  'call',
  'apply',
  'toString',
  'constructor',
])

// ── the fold ─────────────────────────────────────────────────────────────────
// ONE ordered list, folded from the outside in. There are no categories, so
// nothing decides which runs first: every step runs where it was written.
//
// PRIVATE, and that is the claim rather than a tidy-up — a scope IS the function
// that runs it, so a host calls the scope and never the fold. Not exporting it
// is what makes that structural instead of stated.

// `async` is a contract and not a style: a step may throw SYNCHRONOUSLY, and a
// plain function would let that escape past the promise the callable returns.
async function runSteps(steps: readonly AnyStep[], app: object, args: object): Promise<unknown> {
  const at = async (i: number, seen: object): Promise<unknown> => {
    const step = steps[i]
    if (step === undefined) {
      // Every step passed through, so there is no value to hand back: `R` is
      // `never` for such a scope, and `never` has no inhabitant. Throwing is
      // not a fallback beside that type, it IS it. And by the error convention
      // — a THROW is infrastructure — it is the right branch: a scope with no
      // leaf is a CONSTRUCTION bug, and handing back `undefined` would render a
      // bug to its caller as a value.
      throw new Error(
        '@lntt/scope: every step passed through and none produced a value — this scope has no leaf',
      )
    }
    // Nothing happens on the way out. What the step returned is what the caller
    // gets, and the assertion is the one place the fold admits that `Passed` is
    // a type-level understatement (see `step.ts`).
    const next = ((delta: object) => at(i + 1, { ...seen, ...delta })) as unknown as Next<object>
    return step(app, seen, next)
  }
  return at(0, args)
}

function make(steps: readonly AnyStep[], verbs: Verbs): Built {
  const fold = (app: object, params: object) => runSteps(steps, app, params)
  const self = Object.assign(fold, {
    steps,
    // A step is added HERE and nowhere else, so nothing joins the fold without
    // being written as a step.
    step: (s: AnyStep): Built => make([...steps, s], verbs),
    // An extension registers verbs and adds no step. The whole difference
    // between the two verbs is visible in these two lines.
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

type Empty<Args extends object, Vocab extends PropertyKey> = {
  need: {}
  args: Args
  acc: {}
  returns: never
  vocabulary: Vocab
  verbs: {}
}

// Start a scope. The base is carrier-agnostic: nothing to read, no words to say,
// and it mounts everywhere by construction. `scope(carrier)` brings that
// carrier's run parameters and the words it coins.
export function scope<Args extends object = {}>(): Surface<Empty<Args, never>>
export function scope<C extends Carrier>(carrier: C): Surface<Empty<ArgsOf<C>, VocabularyOf<C>>>
export function scope(_carrier?: Carrier): Surface<Empty<{}, never>> {
  // A carrier is PURE DECLARATION — it brings a vocabulary and the shape of a
  // run, and contributes no fold work at all. So there is nothing to inject
  // here, and the argument is read entirely at the type level.
  return make([], {}) as unknown as Surface<Empty<{}, never>>
}
