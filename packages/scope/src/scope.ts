import type { Abort, Ok } from './abort.ts'
import type { Capability, Invalid, Outcome } from './carrier.ts'
import type { CarrierGuard, DepGuard } from './adapter-guard.ts'
import { runSteps } from './fold.ts'
import { guardStep, leafStep } from './steps.ts'

// The extension primitive (`Step`), its composition and the `Sink` shape live
// in `fold.ts`; the factories that turn a written verb into a step live in
// `steps.ts`. They are re-exported here because they are the SPI a carrier or a
// channel is written against.
import type { Step } from './fold.ts'
export type { Next, Step } from './fold.ts'

// ── the intent axis — extracting the vocabulary out of what a guard/leaf
// RETURNS ───────────────────────────────────────────────────────────────────
//
// This is the load-bearing shape. Inferring the intent from INSIDE a union
// constituent (`(ctx) => E | Abort<I>`) makes TypeScript pick the first
// candidate and reject the rest, so a guard that can return two different
// intents stops compiling. Inferring the WHOLE return type and distributing
// afterwards collects every constituent instead — measured, not assumed.
type AnyAbort = Abort<never> | Abort<any>

// One conditional per case, not two: an outer `extends AnyAbort` guard around
// the `infer` would be redundant and paid for twice per verb.
export type IntentKeysOf<R> = R extends Abort<infer I>
  ? keyof I
  : R extends Ok<any, infer I>
    ? keyof I
    : never

// The domain value: an abort contributes none, an `Ok` unwraps to its value,
// anything else passes through unchanged.
export type ValueOf<R> = R extends AnyAbort ? never : R extends Ok<infer V, any> ? V : R

// Stored as a MAP so intersection accumulates across guards and `keyof` reads
// the union back — the same trick the capability axis uses (`CapsOf` below).
export type IntentMap<K extends PropertyKey> = { [P in K]: true }

// The abstract scope: a step stack plus the registry those steps wrote, bound
// to NO app. `__need`/`__result` stay phantom and LOAD-BEARING: drop them and
// two Handlers with the same registry become structurally identical, the
// adapter infers `unknown`, and the deps check silently disables — it stops
// being a check without becoming an error.
export interface Handler<
  Need extends object,
  Reg extends Readonly<Record<string, unknown>>,
  R,
  Seed extends object = {},
  Cap extends Capability = never,
  Int extends PropertyKey = never,
  Eff extends object = {},
> {
  // A SCOPE IS THE FUNCTION THAT RUNS IT. Two arguments, split by LIFETIME:
  // the built chain, which lives as long as the process (§33 tier 1), and
  // everything belonging to this one invocation (§33 tier 2) — the carrier the
  // host holds plus the entries it matched. Who passes them is the same
  // adapter either way, so that is not the axis; how long they live is.
  //
  // The gates ride the ARGUMENTS, so a direct call is checked exactly like a
  // mount. `HostCaps` cannot be inferred from anything and defaults to `never`,
  // which makes `Exclude<Cap, never>` equal `Cap`: a scope requiring a
  // capability is refused unless the caller states the machinery it supplies.
  // Fail-closed without the caller having to remember the gate exists.
  <Pub extends object, HostCaps extends Capability = never>(
    app: Pub & DepGuard<Pub, Need> & CarrierGuard<Cap, HostCaps>,
    seed: Seed,
  ): Promise<Outcome<R, Eff>>

  // The ordered stack the call folds, leaf included as its last link. One list,
  // and nothing beside it: a channel's populate, a `validate`, a guard, a
  // collector and the leaf are all steps, and they run where they were written.
  readonly steps: readonly Step[]
  // What the steps recorded, typed by `Reg` — opaque to the core and precise to
  // whoever wrote it. A mount hands a specific entry to its host's native
  // validator (`sValidator('param', h.registry.params)`), and a widened
  // `Record<string, unknown>` would erase exactly what it needs.
  readonly registry: Reg
  readonly __need?: (n: Need) => void
  readonly __result?: R
  // Phantom, load-bearing: `Cap` is the set of carrier capabilities the scope
  // requires. `Cap` appears in BOTH positions on purpose, which makes it
  // INVARIANT — with only the parameter it is contravariant, and
  // `Handler<…, 'body'>` becomes assignable to `Handler<…, never>`, so naming
  // the type arguments at a mount satisfied the guard while the scope still
  // required a capability the carrier lacked (§34).
  readonly __cap?: (c: Cap) => Cap
  // Phantom, invariant for the same reason: every intent this scope can
  // produce. The mount's `IntentGuard` compares it against what the host
  // renders.
  readonly __int?: (i: Int) => Int
  // Phantom, load-bearing: the shape of `outcome.effects` for THIS scope, so a
  // host reads `effects.cookies` typed, and a scope that never added the
  // channel has no such key to read.
  readonly __eff?: Eff
}

// ── The extension SPI ────────────────────────────────────────────────────────
// The builder composes a BASE surface (`.step`/`.guard`/`.handle`/`.extend`)
// with a CARRIER (chosen once, at construction) and any number of CHANNELS
// (added with `.extend`). Every carrier and every channel lives in its own
// tree-shakable subpath and is NEVER named by this core: HTTP's words, tRPC's
// codes, the body, the cookies. An extension declares, PURELY AS PHANTOM DATA,
// what it contributes on six axes: fluent `methods`, `__ctx` (extra ctx
// fields), `__validatable` (entries it populates AND `validate` may refine, by
// name → the raw type it holds), `__need` (extra app deps), `__caps`
// (capabilities), `__declares` (intents it coins the constructors for).
//
// Every method takes an explicit `this: Self` so the accumulated state is read
// from a normal type parameter (`Self`), sidestepping TypeScript's `this`-type
// query restrictions. This is the ONE idiom the whole builder follows.
export interface ScopeExtension {
  readonly __ctx?: object
  readonly __validatable?: object
  readonly __need?: object
  readonly __caps?: object
  // The intents this extension's OWN constructors coin (`http`'s `redirect`,
  // `notFound`, …) — what CHOOSING it declares, read by `DeclGate` against what
  // a guard/leaf actually returns.
  readonly __declares?: object
  readonly __methods?: object
  // What this extension deposits in `outcome.effects`, keyed by its own name.
  readonly __effects?: object
}

// The brand that separates the two categories, and it goes on the CHANNEL —
// only there. Branding both (carrier `true`, channel `never`) is the shape that
// suggests itself first and it COLLAPSES: `Scope & Http & Cookies` reduces to
// `never` on the conflicting property, and carrier-plus-channel is the ordinary
// case. With the brand on one side there is nothing to conflict, and a carrier
// fails `.extend`'s constraint simply because it does not carry it.
export declare const CHANNEL: unique symbol

// A CARRIER is the thing you pick exactly one of: who is on the other end and
// what language it speaks. The category is DECLARED, not derived from
// behaviour — "it is a carrier if it coins a vocabulary" reads the consequence
// rather than the definition, and that is how `react-router` was miscategorised
// once: at the moment it was judged it coined nothing, and it later grew words.
export interface Carrier extends ScopeExtension {
  // What the host hands over per invocation. `http` needs the request and the
  // route params a router matched; `trpc` needs the request and the payload.
  readonly __seed?: object
  // Which channels this PROTOCOL admits at all. Not the same claim as the
  // mount's `HostCaps`: tRPC has no `Set-Cookie` ever, while a hand-wired HTTP
  // host may simply not flush the ones HTTP does have. The first is knowable
  // where the scope is WRITTEN, the second only where it is MOUNTED — so both
  // gates exist and neither replaces the other (§34's "narrowing a host's set
  // is always legitimate" still holds at the mount).
  readonly __admits?: object
}

// A CHANNEL is a thing you add. `__admission` is REQUIRED, not optional: an
// omitted one reads as `never`, `Exclude<never, …>` is `never`, and the channel
// would then be admitted by every carrier — fail-OPEN in the gate whose whole
// job is to refuse a channel the protocol cannot serve. Required, its author
// has to answer the question.
export interface Channel extends ScopeExtension {
  readonly [CHANNEL]: true
  readonly __admission: object
}

// Phantom accumulators, extracted by the aliases below. Covariant carriers
// (`__acc`/`__ctx`/`__need`/`__validatable`/`__registry`/`__intents`/
// `__declares`) accumulate by INTERSECTION; `__caps`/`__intents`/`__declares`
// are object MAPs whose KEYS are the names, so they too intersect covariantly
// and the union is read with `keyof`.
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type CtxOf<T> = T extends { readonly __ctx?: infer C } ? (C extends object ? C : {}) : {}
type NeedOf<T> = T extends { readonly __need?: infer N } ? (N extends object ? N : {}) : {}
type ValidOf<T> = T extends { readonly __validatable?: infer V } ? (V extends object ? V : {}) : {}
// What the HOST must hand over per invocation: the carrier it holds plus the
// entries it matched. Only a carrier declares it — a channel derives its entry
// from what is already there, so it never widens what a host must supply. This
// is also what types the call's second argument, so seeding the wrong key
// (`{ courseId }` where the entry is `params`) is a compile error naming it.
type SeedOf<T> = T extends { readonly __seed?: infer S } ? (S extends object ? S : {}) : {}
type RegistryOf<T> = T extends { readonly __registry?: infer R }
  ? R extends Readonly<Record<string, unknown>>
    ? R
    : {}
  : {}
// An extension's own capability names, carried through as they are. Two rules,
// and both are about which way a mistake falls (§34).
//
// It must NOT filter the names against a list the core keeps: an unrecognised
// one would collapse to `never`, `CarrierGuard<never, …>` is `unknown`, the
// brand disappears and the scope mounts ANYWHERE — fail-OPEN in the one
// mechanism meant to make a bad mount impossible.
//
// A non-string key is not dropped either, for the same reason: dropping the only
// key leaves `never`, which is that same fail-open. It becomes a name no carrier
// claims, so such a scope mounts NOWHERE until someone declares it — fail-closed,
// and visible in the error.
type CapsOf<T> = T extends { readonly __caps?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_CAPABILITY_KEY'
  : never
// What the guards and the leaf actually PRODUCE — mirrors `CapsOf`'s shape,
// including its non-string-key fail-closed branch, on the intent axis.
type IntentsOf<T> = T extends { readonly __intents?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_INTENT_KEY'
  : never
// What the scope DECLARED, by being given a carrier that coins the intent.
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never
// The effect map: every injected extension's `__effects` intersected, so
// `outcome.effects` carries exactly the keys THIS scope can produce.
type EffOf<T> = T extends { readonly __effects?: infer E } ? (E extends object ? E : {}) : {}
// The verbs an extension contributes, COMPUTED rather than declared. Everything
// an extension states about itself is a `__`-prefixed phantom or the channel
// brand; whatever else it has is a method. A hand-written `__methods` was a
// duplicate of this that could drift from the signature beside it without any
// error — the two had to be kept aligned by whoever wrote the extension.
//
// A non-`__` property that is NOT a method reads as one here. That is the safe
// direction: two extensions contributing the same visible name is a collision
// whether or not it happens to be callable.
type MethodsOf<T> = Exclude<
  keyof T,
  // the phantoms, the brand, and the SPI's OWN fields — `step` and `methods`
  // are how an extension is written, not verbs it contributes, and since the
  // builder now has a `.step()` of its own they would collide with it.
  `__${string}` | typeof CHANNEL | keyof ScopeExtensionValue
>
type AdmitsOf<T> = T extends { readonly __admits?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never
type AdmissionOf<T> = T extends { readonly __admission?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never

// The ctx a guard/leaf reads. Extensions POPULATE it by being chosen or
// extended — `.extend(query)` means `ctx.query` is there, typed as what a query
// string actually carries and readable with no schema at all — and `validate`
// REFINES an entry in place, landing the schema's output in `__acc` under the
// same key.
//
// Which is why this is an OVERRIDE and not the intersection it looks like.
// `CtxOf<Self> & AccOf<Self>` does not replace: refining `query` from
// `Record<string, string | string[]>` to `{ page: number }` yields
// `(string | string[]) & number`, which is `never` — no error anywhere, just a
// field nobody can use, diagnosed wherever it is finally read. The body case
// survives by accident (`unknown & X` is `X`), which is exactly what would make
// this shippable. `Omit` first, then intersect.
export type Ctx<Self> = Omit<SeedOf<Self> & CtxOf<Self> & ValidOf<Self>, keyof AccOf<Self>> &
  AccOf<Self>

// The entries a validating extension may name. It lives HERE, not in that
// extension, because what is validatable is what the CARRIER and the CHANNELS
// populated — the core knows that set; the extension only knows how to run a
// schema over one of them.
// The entries `validate` may name. Non-empty, it is the UNION of their names,
// so an editor completes it and a typo is told what it could have written —
// that is why this is a constraint and not a `DeclGate`-style brand on the
// argument, which would type the parameter `string` and lose completion. The
// one case a union cannot express is the EMPTY one, where it degrades to
// `never` and names nothing, so a sentence stands in there.
//
// The tuple wrap is not decoration: `keyof V extends never` distributes over a
// non-empty union and is vacuously true for it.
export type Validatable<Self> = [keyof ValidOf<Self>] extends [never]
  ? '⛔ this scope has nothing to validate — did you give it a carrier?'
  : keyof ValidOf<Self> & string

// ── gate: the SCOPE does not handle that verb ────────────────────────────────
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// (~616 instantiations per scope against ~780, measured in the spike) and was
// tried first, but it only fires when the NEXT call in the chain touches the
// poisoned type — so a BASE (a carrier + guards, no `.handle`, which is exactly
// the shape a shared `gated()` has in a real app) swallows the mistake entirely
// and surfaces it later, in whichever file finally calls `.handle`, pointing at
// a guard its author never wrote. On the argument the error lands on the guard
// that is actually wrong, wherever the chain stops.
//
// §39(b) warns against brands on the return type for the same reason, and its
// other trap does not apply here: this gate is a CONDITIONAL over `R`, which is
// not an inference site, so `R` still infers from the function's return.
// `A` and `U` are defaulted parameters used as let-bindings, so `Awaited<R>` and
// the missing-intent set are each computed ONCE instead of per mention. They
// sit on the ALIAS, never on the method: a defaulted parameter in a method's
// own list is caller-overridable, and `guard<…, never>(bad)` then walks
// straight through the gate AND empties the accumulated set — measured, and
// the same fail-open §34 had to close on the capability axis.
type DeclGate<Self, R, A = Awaited<R>, U = Exclude<IntentKeysOf<A>, DeclaredOf<Self>>> = [
  U,
] extends [never]
  ? unknown
  : `⛔ this scope does not declare the intent: ${U & string} — is it the right carrier?`

type GuardAcc<Self, Need2, R, A = Awaited<R>> = Self & {
  readonly __acc?: ValueOf<A>
  readonly __need?: Need2
  readonly __intents?: IntentMap<IntentKeysOf<A> & PropertyKey>
}

type HandleOut<Self, Need2 extends object, R, A = Awaited<R>> = Handler<
  NeedOf<Self> & Need2,
  RegistryOf<Self>,
  ValueOf<A>,
  SeedOf<Self>,
  CapsOf<Self>,
  IntentsOf<Self> | IntentKeysOf<A>,
  EffOf<Self>
>

// Gate — the HOST does not handle that scope — is NOT here: it cannot move
// earlier (the same scope is correct on another host, and this definition line
// holds no information about where it will be mounted), and it is the mount's
// concern. It lives beside `DepGuard`/`CarrierGuard` as `IntentGuard`
// (`adapter-guard.ts`), read off `Handler`'s `__int` phantom.

// `Redefines` reads `__methods` to reject a channel that re-declares a method
// already present (§4: a compile error naming the method, at the `.extend`
// call).
type Redefines<Self, F> = Extract<MethodsOf<F>, MethodsOf<Self>>

// A channel needing nothing admitted has `AdmissionOf` = `never`, which
// `Exclude` leaves `never` — but `Channel.__admission` is required precisely so
// that case is unreachable through the public API. The tuple keeps the empty
// case from being a vacuous pass for everything else.
type Admitted<Self, F> = [Exclude<AdmissionOf<F>, AdmitsOf<Self>>] extends [never]
  ? unknown
  : `⛔ this carrier has no ${Exclude<AdmissionOf<F>, AdmitsOf<Self>> & string} to speak of`

// The builder. No axis is ever a method's type parameter — every one lives in a
// phantom read via `Self`, so `.validate`/`.guard`/`.extend` all return
// `Self & <delta>` and never drop a channel's methods (no per-carrier `guard`
// override — the point).
export interface Scope {
  readonly __registry?: Readonly<Record<string, unknown>>
  readonly __acc?: object
  readonly __ctx?: object
  readonly __validatable?: object
  readonly __seed?: object
  readonly __need?: object
  readonly __caps?: object
  readonly __admits?: object
  // What this scope's guards/leaf PRODUCE so far (accumulated by `.guard`/
  // `.handle`) and what the carrier DECLARED it may produce — the two sides
  // `DeclGate`/`IntentGuard` compare.
  readonly __intents?: object
  readonly __declares?: object
  readonly __effects?: object

  // The PRIMITIVE, in the open. Every other verb here is sugar over it, and
  // exposing it is what makes that claim checkable rather than a story told in
  // a comment — `fold.test.ts` writes a scope twice, once with the sugar and
  // once with nothing but this, and compares the outcomes.
  //
  // A raw step expresses every FOLD behaviour: enrich and continue (a guard),
  // stop without continuing (a leaf), wrap `next` and act on the way out (a
  // collecting channel). What the sugar buys is not power, it is not having to
  // call `next` correctly.
  //
  // Two things are NOT fold behaviour and so cannot ride here. CLOSING the
  // builder into a callable is `.handle`'s, and DECLARING what a step
  // contributes — a ctx entry, a capability, a method — is `.extend`'s, because
  // both are type-level. A value that declares is refused below, naming the verb
  // that keeps its declarations instead of dropping them silently.
  step<S extends Step, Self = this>(
    this: Self,
    s: S &
      ([Extract<keyof S, `__${string}` | 'methods'>] extends [never]
        ? unknown
        : '⛔ this declares things — add it with .extend, which keeps them'),
  ): Self

  // A guard: reads `(deps, ctx)`, returns an enrichment `E` (merged into ctx for
  // later steps), a RETURNED `Abort`, or (rarely) an `Ok`. `deps` — the declared
  // app requirement — accumulates into `__need`; the produced value into
  // `__acc`; any intent returned into `__intents`. The gate rides the ARGUMENT
  // (see `DeclGate`): a `g` returning an undeclared intent is rejected here,
  // wherever the chain stops, even in a base that never calls `.handle`.
  guard<Need2 extends object, R, Self = this>(
    this: Self,
    g: ((deps: Need2, ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): GuardAcc<Self, Need2, R>

  // The leaf IS the use case: it declares its own deps and returns a domain
  // value, possibly wrapped in an `Abort`/`Ok`. `handle` reads the accumulated
  // axes off `Self` and produces a CONCRETE `Handler` the adapters consume.
  handle<Need2 extends object, R, Self = this>(
    this: Self,
    leaf: ((deps: Need2, ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): HandleOut<Self, Need2, R>

  // Add a channel. Composes its methods + ctx/validatable/need/caps onto the
  // builder. Rejected at THIS call site if the carrier does not admit it, or if
  // it redefines a method already present (§4). A CARRIER is not expressible
  // here: it carries no `[CHANNEL]` brand, so it fails the constraint
  // structurally — a category error, reported as one.
  extend<F extends Channel, Self = this>(
    this: Self,
    ext: F &
      Admitted<Self, F> &
      ([Redefines<Self, F>] extends [never]
        ? unknown
        : { readonly __ERROR_extension_redefines_method: Redefines<Self, F> }),
  ): Self & F
}

// ── runtime ──────────────────────────────────────────────────────────────────
type AnyGuard = (deps: object, ctx: object) => unknown
type Surface = Record<string, unknown>

// ONE ordered list. A channel's populate, a `validate`, a guard and a sink are
// all steps, so nothing decides which category runs first — they run where they
// were written. That is the same rule `.headers({…})` already followed, and it
// is why `gated().extend(body('json'))` now authenticates BEFORE the body is
// read: an abort in an earlier guard means the parse never happens.
export interface BuildState {
  // Opaque to the core. Steps write into it (`Step.registers`), mounts read out
  // of it. What lands here is whoever put it there's business.
  readonly registry: Readonly<Record<string, unknown>>
  readonly steps: readonly Step[]
}

// The runtime face of a carrier or a channel, and it is two optional fields.
//
// `step` is what the extension does around the rest of the fold: populate an
// entry, collect what the scope writes, wrap the whole thing. One hook, because
// there is one primitive.
//
// `methods` are its fluent verbs, and each is simply a function from its own
// arguments TO A STEP. It never receives the builder's state or a callback to
// rebuild it — pushing the step and returning the next builder is the core's
// job, and it was the only thing any method ever did with them.
//
// A carrier that only declares — `trpc` — contributes neither.
export interface ScopeExtensionValue {
  readonly step?: Step
  readonly methods?: Readonly<Record<string, (...args: never[]) => Step>>
}

// Close the builder: a scope IS the function that runs it. The callable carries
// the stack it folds as properties, so a mount can still read `schemas` for a
// host's native validator without a second entry point existing.
function buildHandler(state: BuildState): Handler<object, Readonly<Record<string, unknown>>, never> {
  const run = (app: object, seed: object) => runSteps(state.steps, app, seed)
  return Object.assign(run, {
    registry: state.registry,
    steps: state.steps,
  }) as unknown as Handler<object, Readonly<Record<string, unknown>>, never>
}

function make(state: BuildState, exts: readonly ScopeExtensionValue[]): Surface {
  // One place where a step is added, and the only place its registry entries
  // are merged — so a verb cannot record something without also running.
  const push = (step: Step): Surface =>
    make(
      {
        registry: { ...state.registry, ...step.registers },
        steps: [...state.steps, step],
      },
      exts,
    )
  const base: Surface = {
    registry: state.registry,
    step(s: Step) {
      return push(s)
    },
    guard(g: AnyGuard) {
      return push(guardStep(g))
    },
    handle(leaf: AnyGuard) {
      // Push the leaf's step like any other, then CLOSE. The push is the fold's
      // half and a raw `.step()` could write it; the close is not fold work at
      // all — it is the builder becoming the callable, which is why `.handle`
      // is the only terminal.
      return buildHandler({ ...state, steps: [...state.steps, leafStep(leaf)] })
    },
    extend(ext: ScopeExtensionValue) {
      return make(inject(state, ext), [...exts, ext])
    },
  }
  // Every extension's verbs, wired the same way: call it, get a step, push it.
  const verbs: Surface = {}
  for (const ext of exts) {
    for (const [name, make_] of Object.entries(ext.methods ?? {})) {
      verbs[name] = (...args: never[]) => push(make_(...args))
    }
  }
  return Object.assign(base, verbs)
}

// Choosing a carrier and adding a channel deposit the same thing — a step — so
// they share one function rather than two that drift.
function inject(state: BuildState, ext: ScopeExtensionValue): BuildState {
  return ext.step === undefined ? state : { ...state, steps: [...state.steps, ext.step] }
}

const initial: BuildState = { registry: {}, steps: [] }

// Start a scope. `scope()` is the carrier-agnostic base — nothing to read, no
// way to abort, and it mounts everywhere by construction. `scope(carrier)`
// brings that carrier's ctx, the entries it populates, and the words it coins.
// A carrier is chosen exactly ONCE, here, which is why there is no
// `.extend(carrier)`: `scope().extend(http).extend(rpc)` was expressible and
// only failed later, at the mount, by accident — every host refused the other's
// words, so it mounted NOWHERE rather than being refused where it was written.
export function scope(): Scope
export function scope<C extends Carrier>(carrier: C): Scope & C
export function scope(carrier?: Carrier): Scope {
  const value = carrier as unknown as ScopeExtensionValue | undefined
  return (
    value === undefined ? make(initial, []) : make(inject(initial, value), [value])
  ) as unknown as Scope
}
