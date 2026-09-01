// KERNEL 4 — TRANSPARENT. The core has no outcome at all.
//
// A step returns something; the fold hands it back untouched. No branches, no
// `ok`, no `Outcome`, no brand, no normalising pass. Whoever calls a scope
// receives exactly what the leaf returned, and what it MEANS is the carrier's
// business — if a carrier wants errors-as-values, or exceptions, or its own
// envelope, none of that is the core's concern.
//
// Two things have to survive that, and this kernel exists to find out whether
// they do:
//
//   1. THE GATE. `.step` must still refuse a word the carrier does not coin,
//      which means the core must read an intent NAME off a return type. It
//      cannot do that from a phantom alone — an all-optional shape is matched
//      by nearly everything, so `infer` would fire on plain domain values too.
//      So the declaration rides a member a word carries anyway: `intent`.
//      That is a SHAPE the core knows, not a wrapper it builds.
//
//   2. THE RETURN UNION. With nothing branded, what does `next` return? It
//      cannot be `unknown` — `unknown | X` is `unknown`, and the whole union
//      the state accumulates would collapse on the first pass-through step.
//      So `Passed` is an opaque marker: the fold really hands back whatever the
//      inner steps produced, and the TYPE declines to say what. A wrapping step
//      is told "the rest of the fold answered", and to read that answer it must
//      go through its carrier — which is the cost this kernel measures.

export interface UnknownIntent {
  readonly __unknown_intent: true
}

// The ONE shape the core knows: a word declares an intent name. No symbol, no
// runtime check, nothing built — a carrier's own type simply satisfies this.
export interface Coined<I extends object = UnknownIntent> {
  readonly intent: unknown
  readonly __i?: (i: I) => I
}

declare const PASSED: unique symbol

// What a wrapping step is handed by `next`: an answer it did not produce and
// cannot read without asking its carrier.
//
// The member is REQUIRED, and that was a BUG here until it was found against the
// shipped core. Optional, this is a weak type: `R extends Passed` then holds for
// anything that COULD carry the key, which an index signature can — so `ValueOf`
// ate a leaf returning `Record<string, number>` and the scope declared `never`.
// Corrected so the prior art does not teach the mistake; the README's numbers
// are unaffected and were re-taken to confirm it.
export interface Passed {
  readonly [PASSED]: true
}

// Transparent: what the scope hands back IS what the leaf returned.
export type Outcome<R> = R

// `Passed` is excluded here, so `ResultOf` and `ReturnsOf` are the SAME type in
// this kernel — the marker is machinery, and no consumer should ever see it.
// One projection, where the branded designs need two.
export type ValueOf<R> = Exclude<R, Passed>

type IntentKeysOf<R> = R extends Coined<infer I> ? keyof I : never

// The whole runtime half of the outcome, in one line: there isn't one.
const outcomeOf = (r: unknown): unknown => r

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
