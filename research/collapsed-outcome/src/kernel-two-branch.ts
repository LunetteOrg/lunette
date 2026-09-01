// KERNEL 1 — the outcome as it ships today: TWO branches.
//
// `ok` carries a domain value and may carry an intent beside it; `abort` carries
// an intent and NO value, so `ValueOf` sends that branch to `never` and what the
// scope declares it yields is the domain side only. `out.ok` is the discriminant.
//
// This is the BASELINE. The two kernels beside it differ in this half and in
// nothing else.

const OUTCOME = Symbol.for('lntt.research.two-branch.outcome')
const ABORT = Symbol.for('lntt.research.two-branch.abort')
const OK = Symbol.for('lntt.research.two-branch.ok')

export interface UnknownIntent {
  readonly __unknown_intent: true
}

export interface Abort<I extends object = UnknownIntent> {
  readonly [ABORT]: true
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

export interface Ok<V, I extends object = UnknownIntent> {
  readonly [OK]: true
  readonly value: V
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

export const abort = <I extends object = UnknownIntent>(intent: object): Abort<I> => ({
  [ABORT]: true,
  intent,
})

export const ok = <V, I extends object = UnknownIntent>(value: V, intent: object): Ok<V, I> => ({
  [OK]: true,
  value,
  intent,
})

export type Outcome<R> = { readonly [OUTCOME]: true } & (
  | { readonly ok: true; readonly value: R; readonly intent?: unknown }
  | { readonly ok: false; readonly intent: unknown }
)

type AnyOutcome = Outcome<unknown>
type AnyAbort = Abort<never> | Abort<any>

// THE LINE THIS RESEARCH IS ABOUT: a refusal contributes nothing to `R`.
export type ValueOf<R> = R extends AnyOutcome
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

const isOutcome = (x: unknown): x is Outcome<unknown> =>
  typeof x === 'object' && x !== null && OUTCOME in x
const isAbort = (x: unknown): x is Abort<never> =>
  typeof x === 'object' && x !== null && ABORT in x
const isOk = (x: unknown): x is Ok<unknown, never> =>
  typeof x === 'object' && x !== null && OK in x

const outcomeOf = (r: unknown): Outcome<unknown> => {
  if (isOutcome(r)) return r
  if (isAbort(r)) return { [OUTCOME]: true, ok: false, intent: r.intent }
  if (isOk(r)) return { [OUTCOME]: true, ok: true, value: r.value, intent: r.intent }
  return { [OUTCOME]: true, ok: true, value: r }
}

// What `next` hands back. Branded, so a step passing it through is told apart
// from one producing a value.
export type Passed = Outcome<unknown>

// ── the accumulated state, the ctx, the builder, the fold ────────────────────
// Everything below this line is BYTE-IDENTICAL in the three kernels, and the
// README says how to check it. A difference between them is therefore a
// difference the outcome question caused, and not one the builder introduced.

export interface State {
  readonly need: object
  readonly args: object
  readonly acc: object
  readonly returns: unknown
  readonly vocabulary: PropertyKey
}

// An OVERRIDE, not the intersection it looks like: re-populating a key is what
// a refinement is, and intersecting would give `never`.
export type Ctx<S extends State> = Omit<S['args'], keyof S['acc']> & S['acc']

export type Next<Add extends object> = (add: Add) => Promise<Passed>

export type AnyStep = (app: never, ctx: never, next: Next<object>) => unknown

// The supply side: a word this carrier does not coin is refused where the step
// is WRITTEN. It reads `IntentKeysOf`, which is the ONE piece each kernel
// defines differently — so this gate is what shows the vocabulary machinery
// survives the collapse untouched.
type ReturnGate<
  S extends State,
  Ret,
  A = Awaited<Ret>,
  U = Exclude<IntentKeysOf<A>, S['vocabulary']>,
> = [U] extends [never]
  ? unknown
  : `⛔ this scope does not coin the word: ${U & string} — is it the right carrier?`

type Grown<S extends State, Need2 extends object, Add extends object, Ret> = Scope<{
  need: S['need'] & Need2
  args: S['args']
  acc: S['acc'] & Add
  returns: S['returns'] | Awaited<Ret>
  vocabulary: S['vocabulary']
}>

export interface Scope<S extends State> {
  (app: S['need'], args: S['args']): Promise<Outcome<ValueOf<S['returns']>>>
  readonly steps: readonly AnyStep[]
  step<Need2 extends object, Add extends object, Ret>(
    s: ((app: Need2, ctx: Ctx<S>, next: Next<Add>) => Ret | Promise<Ret>) & ReturnGate<S, Ret>,
  ): Grown<S, Need2, Add, Ret>
}

export type ResultOf<Sc> = Sc extends Scope<infer S> ? ValueOf<S['returns']> : never

// ── the projection that answers "what can this scope hand back?" ─────────────
// It reads the RAW union the state accumulated, before `ValueOf` touches it, so
// it is indifferent to what each kernel decided a word contributes. The only
// thing removed is the outcome that merely passed through from `next`.
export type ReturnsOf<Sc> = Sc extends Scope<infer S> ? Exclude<S['returns'], Passed> : never

// The DEMAND side: every word the steps written so far actually say. The supply
// gate (`ReturnGate`) asks whether the carrier coins a word; this is what a
// MOUNT asks instead — can the host I am attaching to render them all.
export type IntentsOf<Sc> = Sc extends Scope<infer S> ? IntentKeysOf<S['returns']> : never

// ── the MOUNT, and its gate ──────────────────────────────────────────────────
// A host declares the words it knows how to render. It is a written-out SET,
// where demand is open: a word no host claims mounts nowhere, and widening the
// set is a claim about machinery.
export interface Host {
  readonly __renders?: object
}

type RendersOf<H> = H extends { __renders?: infer R } ? keyof R : never

// Rides the SCOPE argument, for the reason the supply gate rides the step's:
// on the return type it would only fire when something downstream touched the
// poisoned type, and a mount is often the last thing a file does.
type MountGate<Sc, H, U = Exclude<IntentsOf<Sc>, RendersOf<H>>> = [U] extends [never]
  ? unknown
  : `⛔ this host cannot render the word: ${U & string} — mount it somewhere that can`

export function mount<S extends State, H extends Host>(
  _host: H,
  scope: Scope<S> & MountGate<Scope<S>, H>,
): (app: S['need'], args: S['args']) => Promise<Outcome<ValueOf<S['returns']>>> {
  return (app, args) => (scope as Scope<S>)(app, args)
}

export interface Carrier {
  readonly __args?: object
  readonly __vocabulary?: object
}

type ArgsOf<C> = C extends { __args?: infer A } ? (A extends object ? A : object) : object
type VocabOf<C> = C extends { __vocabulary?: infer V } ? keyof V : never

export function scope<C extends Carrier>(
  _carrier?: C,
): Scope<{
  need: {}
  args: ArgsOf<C>
  acc: {}
  returns: never
  vocabulary: VocabOf<C>
}> {
  return make([]) as never
}

function make(steps: readonly AnyStep[]): unknown {
  const self = (app: object, args: object) => runSteps(steps, app, args)
  return Object.assign(self, {
    steps,
    step: (s: AnyStep) => make([...steps, s]),
  })
}

// `async` is a contract and not a style: a step may throw SYNCHRONOUSLY.
async function runSteps(
  steps: readonly AnyStep[],
  app: object,
  args: object,
): Promise<Outcome<unknown>> {
  const at = async (i: number, seen: object): Promise<Outcome<unknown>> => {
    const step = steps[i]
    if (step === undefined) {
      throw new Error('research: every step passed through and none produced a value')
    }
    const run = step as unknown as (a: object, c: object, n: Next<object>) => unknown
    // The fold really hands the inner answer back. What `next` DECLARES that
    // answer to be is each kernel's choice — a branded outcome, or an opaque
    // marker — so the bridge is asserted here, once, and identically.
    const next = ((delta: object) => at(i + 1, { ...seen, ...delta })) as unknown as Next<object>
    return outcomeOf(await run(app, seen, next))
  }
  return at(0, args)
}
