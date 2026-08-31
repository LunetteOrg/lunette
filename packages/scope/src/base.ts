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
  // The verbs its steps have contributed.
  readonly verbs: Verbs
}

// ── reading what a step handed back ──────────────────────────────────────────
// Of the three things a step may return, two contribute NO domain value: the
// outcome `next` gave it (it is passing through — the brand says so) and a WORD
// (it contributes on the intent axis instead). What is left is the value.
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

// ── the verbs a step contributed ─────────────────────────────────────────────
// COMPUTED from the factory rather than declared beside it — and computed from
// what it RETURNS, not only from its arguments. Reading the arguments alone was
// the first shape and it left three holes at once, each measured (§14): the
// WORD its step says was dropped, which reopened the intent fail-open through
// the back door; what it POPULATES was dropped; and what it REQUIRES of the ctx
// was checked by nothing, so a verb could demand an entry no scope has and
// still compile.
//
// Reading the return closes all three at once, and makes literal the sentence
// the first shape only claimed: a verb IS `.step` with its arguments curried.
// The factory is `(...args) => a step`, so the method is `(...args) => whatever
// `.step` would have produced for that step`.

// Pull a step's four axes out of whichever form the factory returned. The
// object form is unwrapped first, so `{ run }` and a bare function read alike.
//
// A LEAF has two parameters and still matches the three-parameter pattern, with
// `Add` inferred as `unknown` — measured. `unknown` is not an `object`, and
// `X & unknown` is `X`, so it contributes nothing either way; the `extends
// object` narrowing below makes that explicit rather than accidental.
type StepOf<V> = V extends { readonly run: infer R } ? R : V

type NeedOfStep<Step> = Step extends (app: infer N, ...rest: never[]) => unknown
  ? N extends object
    ? N
    : {}
  : {}
type CtxOfStep<Step> = Step extends (app: never, ctx: infer C, ...rest: never[]) => unknown
  ? C
  : unknown
type AddOfStep<Step> = Step extends (
  app: never,
  ctx: never,
  next: (delta: infer A) => any,
) => unknown
  ? A extends object
    ? A
    : {}
  : {}
type RetOfStep<Step> = Step extends (...args: never[]) => infer R ? Awaited<R> : never

// The one gate that does NOT ride an argument, because a verb's step is not an
// argument of anything: the builder never receives it, it manufactures it. So
// the METHOD ITSELF becomes the message, which still lands on the call — a
// string has no call signatures, so `.header('x', '1')` fails on that line and
// prints the reason. That is as early as this can land, and it is not the
// return-type poisoning §2 rejects: nothing downstream has to touch the result
// for it to fire.
// A template-literal message does NOT work here, and that is worth recording:
// the property resolves to a string literal, and the call error prints its
// APPARENT type — `Type 'String' has no call signatures` — so the reason is
// lost. Naming the message as a PROPERTY, the way `DepGuard` does, puts it back
// in the diagnostic, because the object type is printed whole.
type CtxGate<S extends State, Step> = Ctx<S> extends CtxOfStep<Step>
  ? unknown
  : {
      readonly '⛔ this verb reads a ctx this scope has not got — is a step missing before it?': never
    }

type VerbsOn<S extends State> = {
  readonly [K in keyof S['verbs']]: S['verbs'][K] extends (...args: infer A) => infer V
    ? CtxGate<S, StepOf<V>> extends object
      ? CtxGate<S, StepOf<V>>
      : (
          ...args: A
        ) => Grown<S, NeedOfStep<StepOf<V>>, AddOfStep<StepOf<V>>, RetOfStep<StepOf<V>>, StepOf<V>>
    : never
}

// What a scope IS to whoever holds one: the callable builder plus the verbs its
// steps have contributed. The verbs are a plain record with no call signature
// of their own, so intersecting them creates no overload — which is what made
// the always-callable shape look impossible at first.
export type Surface<S extends State> = Scope<S> & VerbsOn<S>

type VerbsIn<V> = V extends { readonly methods: infer M } ? (M extends Verbs ? M : {}) : {}

type Grown<S extends State, Need2 extends object, Add extends object, Ret, V> = Surface<{
  need: S['need'] & Need2
  seed: S['seed']
  acc: S['acc'] & Add
  result: S['result'] | ValueOf<Awaited<Ret>>
  intents: S['intents'] | IntentKeysOf<Awaited<Ret>>
  declares: S['declares']
  verbs: S['verbs'] & VerbsIn<V>
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
  // Phantom and INVARIANT — present in both positions on purpose. With only the
  // parameter it is contravariant, and a caller naming the type arguments at a
  // mount could supply `never` and satisfy a gate the scope still fails (§34,
  // on the capability axis; the same hole, the same shape).
  //
  // Every word this scope can say, INCLUDING one returned from a raw step: the
  // word rides the step's return type and is never erased into the outcome.
  readonly __int?: (i: S['intents']) => S['intents']

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
  step<Need2 extends object, Add extends object, Ret, V extends { run: unknown }>(
    s: (
      | ((app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret>)
      | (V & { run: (app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret> })
    ) &
      DeclGate<S, Ret>,
  ): Grown<S, Need2, Add, Ret, V>
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
