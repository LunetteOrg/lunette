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

// THE PARAMETERISED FORM. Same axes as the intersection form next door, same
// gates, same ctx rules — the ONE difference is where the accumulated state
// lives: in a type PARAMETER rather than in phantoms read back through `Self`.
//
// Two things follow from that, and they are the reason to measure it:
//
//   the scope is ALWAYS callable and always typed. A call signature can read
//   `S` directly, where it cannot read `Self` — `this` binds to the receiver of
//   a METHOD call, and calling an object directly binds it to `void`. So there
//   is no termination declaration and no transition: a scope IS the function
//   that runs it, from the first line.
//
//   `result` accumulates as a UNION. Under intersection it cannot: `A & B` over
//   a type that is not a key collapses, which is why the other union-valued
//   axes are maps of NAMES. Here it is `S['result'] | …`, so a step that can
//   return a domain value of its own appears in what the scope produces.
//
// The verbs ride ALONGSIDE, as a plain record with no call signature of its
// own, so intersecting them creates no overload — which is what made the
// always-callable shape look impossible at first.

// ── the accumulated state ────────────────────────────────────────────────────
export interface State {
  readonly need: object
  readonly seed: object
  readonly acc: object
  readonly result: unknown
  readonly intents: PropertyKey
  readonly declares: PropertyKey
  readonly verbs: Verbs
}

// ── the same reads as the other kernel ───────────────────────────────────────
type AnyOutcome = Outcome<unknown>
type AnyAbort = Abort<never> | Abort<any>
type ValueOf<R> = R extends AnyOutcome
  ? never
  : R extends AnyAbort
    ? never
    : R extends Ok<infer V, any>
      ? V
      : R

type IntentKeysOf<R> = R extends Abort<infer I>
  ? keyof I
  : R extends Ok<any, infer I>
    ? keyof I
    : never

type DeclGate<S extends State, Ret, A = Awaited<Ret>, U = Exclude<IntentKeysOf<A>, S['declares']>> = [
  U,
] extends [never]
  ? unknown
  : `⛔ this scope does not coin the word: ${U & string} — is it the right carrier?`

// The ctx a step reads. Same override rule (§9): a step re-populating a key it
// already has must REPLACE it, not intersect with it.
type Ctx<S extends State> = Omit<S['seed'], keyof S['acc']> & S['acc']

type VerbsOn<M> = {
  readonly [K in keyof M]: M[K] extends (...args: infer A) => unknown
    ? (...args: A) => unknown
    : never
}

type VerbsIn<V> = V extends { readonly methods: infer M } ? (M extends Verbs ? M : {}) : {}

type Grown<S extends State, Need2 extends object, Add extends object, Ret, V> = Scope<{
  need: S['need'] & Need2
  seed: S['seed']
  acc: S['acc'] & Add
  result: S['result'] | ValueOf<Awaited<Ret>>
  intents: S['intents'] | IntentKeysOf<Awaited<Ret>>
  declares: S['declares']
  verbs: S['verbs'] & VerbsIn<V>
}> &
  VerbsOn<S['verbs'] & VerbsIn<V>>

export interface Scope<S extends State> {
  // A SCOPE IS THE FUNCTION THAT RUNS IT — always, with no transition. The
  // signature reads `S` directly, so the deps gate, the run's parameters and
  // the result are all typed with no declaration anywhere.
  <Pub extends object>(
    app: Pub & DepGuard<Pub, S['need']>,
    params: S['seed'],
  ): Promise<Outcome<S['result']>>

  readonly steps: readonly AnyStep[]
  readonly __int?: (i: S['intents']) => S['intents']

  step<Need2 extends object, Add extends object, Ret, V extends { run: unknown }>(
    s: (
      | ((app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret>)
      | (V & { run: (app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret> })
    ) &
      DeclGate<S, Ret>,
  ): Grown<S, Need2, Add, Ret, V>
}

export interface Carrier {
  readonly __seed?: object
  readonly __declares?: object
}

type SeedOf<C> = C extends { readonly __seed?: infer T } ? (T extends object ? T : {}) : {}
type DeclaredOf<C> = C extends { readonly __declares?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never

// ── runtime — identical to the other kernel ──────────────────────────────────
interface Built {
  (app: object, params: object): Promise<Outcome<unknown>>
  readonly steps: readonly AnyStep[]
  step(s: AnyStepValue): Built
}

function make(steps: readonly AnyStep[], verbs: Verbs): Built {
  const fold = (app: object, params: object) => runSteps(steps, app, params)
  const self = Object.assign(fold, {
    steps,
    step: (s: AnyStepValue): Built => {
      const { run, methods } = readStep(s)
      return make([...steps, run], { ...verbs, ...methods })
    },
  })
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

export function scope<Seed extends object = {}>(): Scope<Empty<Seed, never>>
export function scope<C extends Carrier>(carrier: C): Scope<Empty<SeedOf<C>, DeclaredOf<C>>>
export function scope(_carrier?: Carrier): Scope<Empty<{}, never>> {
  return make([], {}) as unknown as Scope<Empty<{}, never>>
}
