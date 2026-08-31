import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort, Ok } from './abort.ts'
import type { Capability, Invalid } from './carrier.ts'
import { unit, type OutputOf, type UnitSchema } from './schema.ts'

// A PREPARE step, part of the extension SPI: reads the raw carrier (the host's
// full object, e.g. a Fetch `Request` with a readable body) and returns an
// enrichment merged into `ctx`, an `Abort`, or an `Invalid` (a schema failure
// discovered INSIDE a prepare step — `.body()`/`.form()` validate their own
// channel here, and must be able to report the same third branch the core's
// own `.input` validation does). Extensions push these to run carrier-reading
// work BEFORE the guard fold, without the core knowing what they do.
export type Prepare = (
  carrier: object,
) => Promise<object | Abort<any> | Invalid> | object | Abort<any> | Invalid

// A SINK, the other half of the extension SPI and the mirror of `Prepare`: where
// a prepare step reads the carrier INTO the ctx, a sink is something the scope
// WRITES during the fold whose result leaves with the `Outcome`. Created fresh
// per invocation: `ctx` is what a guard/leaf sees under `key`, `collect` is what
// lands in `outcome.effects[key]`.
//
// This is what keeps response concerns OUT of the core. `Set-Cookie` and the
// response headers are not fold concepts — they are what the `cookies` and
// `headers` extensions happen to collect, and the fold never learns their names
// (§34). A host pack reads the effects it understands, through the reader the
// extension exports next to its sink.
export interface Sink {
  readonly key: string
  readonly ctx: unknown
  collect(): unknown
}

export type SinkFactory = () => Sink

// ── the intent axis — extracting the vocabulary out of what a guard/leaf
// RETURNS (modelled on `research/outcome-vocabulary/src/kernel.ts`) ─────────
//
// This is the load-bearing shape. Inferring the intent from INSIDE a union
// constituent (`(ctx) => E | Abort<I>`) makes TypeScript pick the first
// candidate and reject the rest, so a guard that can return two different
// intents stops compiling. Inferring the WHOLE return type and distributing
// afterwards collects every constituent instead — measured, not assumed.
type AnyAbort = Abort<never> | Abort<any>
type AnyOk = Ok<any, any>

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
// the union back — the same trick the capability axis already uses (`CapsOf`
// below). It takes the KEYS rather than recomputing the distribution.
export type IntentMap<K extends PropertyKey> = { [P in K]: true }

// The abstract scope: an input schema + a guard/leaf stack captured as data,
// bound to NO app. `Handler` carries the REAL input `schema` (the object a
// host hands to its native validator) alongside phantom markers. `__need` and
// `__result` stay phantom and LOAD-BEARING: drop them and two Handlers with the
// same schema become structurally identical, the adapter infers `unknown`, and
// the deps check silently disables — it stops being a check without becoming an
// error. The `schema` field is
// what pins `InferInput`/`InferOutput` for every host's native validator.
export interface Handler<
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability = never,
  Int extends PropertyKey = never,
  Eff extends object = {},
> {
  readonly schema: S
  // Extension-contributed PREPARE steps: they read the raw carrier (before the
  // headless ctx is built) and enrich the ctx, or RETURN an `Abort`/`Invalid`.
  // The core neither knows nor names what they do — the `body` extension's
  // `.body`/`.form` push steps that parse the request body into `ctx.body` /
  // `ctx.form`. This keeps the core `Handler` and the fold extension-agnostic.
  readonly prepare?: ReadonlyArray<Prepare>
  // Erased fold ingredients — the scope defers execution until an app is mounted
  // at the adapter; `runFold`/`runScope` run these.
  readonly guards: ReadonlyArray<(deps: object, ctx: object) => unknown>
  // Extension-contributed SINKS: the fold instantiates each per invocation and
  // hands what they collected to the `Outcome`. Empty for a scope that declares
  // no extension with an output channel.
  readonly sinks?: ReadonlyArray<SinkFactory>
  readonly leaf: (deps: object, ctx: object) => unknown
  readonly __need?: (n: Need) => void
  readonly __result?: R
  // Phantom, load-bearing: `Cap` is the set of carrier capabilities the scope
  // requires. The adapter's `CarrierGuard` reads it to reject a mount on a host
  // that cannot supply them (e.g. `body` on tRPC).
  //
  // `Cap` appears in BOTH positions on purpose, which makes it INVARIANT. With
  // only the parameter it is contravariant, and `Handler<…, 'body'>` is then
  // assignable to `Handler<…, never>` — so naming the type arguments at a mount
  // (`w.handler<…, never>(scope)`) satisfied the guard while the scope still
  // required a capability the carrier lacked.
  //
  // `Need` is not exposed the same way, and the reason is the DIRECTION of each
  // guard's predicate against the bottom type, not the phantom (`__need` has the
  // identical shape). `DepGuard` asks `Pub extends Need`, which `never` makes
  // FALSE — so the brand fires; naming a smaller object instead is refused by
  // contravariance, since the handler's own `Need` no longer fits. `CarrierGuard`
  // asks whether `Exclude<Cap, HostCaps>` is `never`, which `never` satisfies
  // VACUOUSLY — and contravariance waves it through, since `never` is assignable
  // to everything. Protected on both moves versus neither (§34). Measured across
  // @lntt/integration: 274,353 → 274,347 instantiations — it saves a little.
  readonly __cap?: (c: Cap) => Cap
  // Phantom, invariant for the same reason as `__cap`: `Int` is the set of
  // intents this scope PRODUCES (every `Abort`/`Ok` its guards and leaf can
  // return). The mount's gate (`MountGate`) compares it against what the host
  // renders; naming the type argument by hand must not be able to shed it.
  readonly __int?: (i: Int) => Int
  // Phantom: the schema's params shape, so a route mount can check the route
  // pattern against it (a later phase — the route gate itself is not wired
  // here, only the field it will read).
  readonly __par?: OutputOf<S>
  // Phantom, load-bearing: the shape of `outcome.effects` for THIS scope, so a
  // host reads `effects.cookies` typed, and a scope that never injected the
  // extension has no such key to read.
  readonly __eff?: Eff
}

// ── The extension SPI ────────────────────────────────────────────────────────
// The builder is a small runtime composing a BASE surface (`.guard`/`.handle`/
// `.extend`) with any injected EXTENSIONS. A carrier — the HTTP vocabulary in
// `@lntt/scope/http`, the bus at #10 — lives in its OWN tree-shakable subpath
// and is NEVER named by this core. `.input` is not part of that base surface
// either: the INPUT channel is carrier-specific too (route params on HTTP, the
// payload on RPC), so each carrier names its own verb for it (`http`'s
// `.params(schema)`). An extension declares, PURELY AS PHANTOM DATA, what it
// contributes on five axes: fluent `methods`, `__ctx` (extra ctx fields),
// `__need` (extra app deps), `__caps` (capabilities), `__declares` (intents it
// coins the constructors for); the core reads them back generically off `Self`.
// Adding a carrier is a new subpath, ZERO change here (principle 6 / §10).
//
// Every method takes an explicit `this: Self` so the accumulated state is read
// from a normal type parameter (`Self`), sidestepping TypeScript's `this`-type
// query restrictions. This is the ONE idiom the whole builder follows.

// Phantom accumulators, extracted by the aliases below. Covariant carriers
// (`__acc`/`__ctx`/`__need`/`__schema`/`__intents`/`__declares`) accumulate by
// INTERSECTION; `__caps`/`__intents`/`__declares` are object MAPs whose KEYS
// are the names, so they too intersect covariantly and the union is read with
// `keyof`.
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type CtxOf<T> = T extends { readonly __ctx?: infer C } ? (C extends object ? C : {}) : {}
type NeedOf<T> = T extends { readonly __need?: infer N } ? (N extends object ? N : {}) : {}
type SchemaOf<T> = T extends { readonly __schema?: infer S }
  ? S extends StandardSchemaV1
    ? S
    : UnitSchema
  : UnitSchema
type ParamsOf<T> = OutputOf<SchemaOf<T>>
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
// What the scope DECLARED, by extending a carrier that coins the intent.
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? [keyof M] extends [string]
    ? keyof M
    : '__NON_STRING_DECLARED_KEY'
  : never
// The effect map: every injected extension's `__effects` intersected, so
// `outcome.effects` carries exactly the keys THIS scope can produce.
type EffOf<T> = T extends { readonly __effects?: infer E } ? (E extends object ? E : {}) : {}
type MethodsOf<T> = T extends { readonly __methods?: infer M } ? keyof M : never

// The ctx a guard/leaf reads: the validated `params` + every extension's ctx
// (`__ctx` — `http`'s `request`, `cookies`, …) + every prior guard enrichment
// (`__acc`). The agnostic base commits to no carrier, so it adds nothing of
// its own.
export type Ctx<Self> = { readonly params: ParamsOf<Self> } & CtxOf<Self> & AccOf<Self>

// ── gate 1: the SCOPE does not handle that verb ──────────────────────────────
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// (~616 instantiations per scope against ~780, measured in the spike) and was
// tried first, but it only fires when the NEXT call in the chain touches the
// poisoned type — so a BASE (`.extend` + `.guard`, no `.handle`, which is
// exactly the shape a shared `gated()` has in a real app) swallows the mistake
// entirely and surfaces it later, in whichever file finally calls `.handle`,
// pointing at a guard its author never wrote. On the argument the error lands
// on the guard that is actually wrong, wherever the chain stops.
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
  : `⛔ this scope does not declare the intent: ${U & string} — did you forget to .extend() the carrier that coins it?`

type GuardAcc<Self, Need2, R, A = Awaited<R>> = Self & {
  readonly __acc?: ValueOf<A>
  readonly __need?: Need2
  readonly __intents?: IntentMap<IntentKeysOf<A> & PropertyKey>
}

type HandleOut<Self, Need2 extends object, R, A = Awaited<R>> = Handler<
  NeedOf<Self> & Need2,
  SchemaOf<Self>,
  ValueOf<A>,
  CapsOf<Self>,
  IntentsOf<Self> | IntentKeysOf<A>,
  EffOf<Self>
>

// Gate 2 — the HOST does not handle that scope — is NOT here: it cannot move
// earlier (the same scope is correct on another host, and this definition line
// holds no information about where it will be mounted), and it is the mount's
// concern, not the definition's. It lives beside `DepGuard`/`CarrierGuard` as
// `IntentGuard` (`adapter-guard.ts`), read off `Handler`'s `__int` phantom.

// An extension is a value the core composes. It declares its face by the phantom
// axes it carries (`__ctx`/`__need`/`__caps`/`__declares`/`__methods`) plus its
// fluent methods; `Redefines` reads `__methods` to reject an extension that
// re-declares a method already present (§4: a compile error naming the method,
// at the `.extend` call).
export interface ScopeExtension {
  readonly __ctx?: object
  readonly __need?: object
  readonly __caps?: object
  // The intents this extension's OWN constructors coin (`http`'s `redirect`,
  // `notFound`, …) — what `.extend`ing it DECLARES, read by `DeclGate` against
  // what a guard/leaf actually returns.
  readonly __declares?: object
  readonly __methods?: object
  // What this extension deposits in `outcome.effects`, keyed by its own name.
  readonly __effects?: object
}
type Redefines<Self, F> = Extract<MethodsOf<F>, MethodsOf<Self>>

// The builder. `S` never appears as a parameter — the schema, like every other
// axis, lives in a phantom (`__schema`) read via `Self`, so `.guard`/`.extend`/
// `.handle` all return `Self & <delta>` and never drop an extension's methods
// (no per-carrier `guard` override — the point).
export interface Scope {
  readonly __schema?: StandardSchemaV1
  readonly __acc?: object
  readonly __ctx?: object
  readonly __need?: object
  readonly __caps?: object
  // What this scope's guards/leaf PRODUCE so far (accumulated by `.guard`/
  // `.handle`) and what extending a carrier DECLARED it may produce (accumulated
  // by `.extend`) — the two sides `DeclGate`/`MountGate` compare.
  readonly __intents?: object
  readonly __declares?: object
  // The builder DECLARES its own verbs, and that is what makes the collision
  // gate cover them. `MethodsOf` reads `keyof M`, so leaving this `object` made
  // `keyof object` — that is, `never` — and `Redefines` could never match
  // against the base: an extension contributing a `guard` passed the gate, and
  // since `Object.assign` mounts extensions AFTER the base, it replaced the
  // real one. Extension-vs-extension always worked, because there `Self`
  // already carries a real `__methods` (§4).
  readonly __methods?: { guard: true; handle: true; extend: true }
  readonly __effects?: object

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

  // Inject an extension. Composes its methods + ctx/need/caps/declares onto the
  // builder. Rejected at THIS call site if it redefines a method already
  // present (§4).
  extend<F extends ScopeExtension, Self = this>(
    this: Self,
    ext: F &
      ([Redefines<Self, F>] extends [never]
        ? unknown
        : { readonly __ERROR_extension_redefines_method: Redefines<Self, F> }),
  ): Self & F
}

// ── runtime ──────────────────────────────────────────────────────────────────
type AnyGuard = (deps: object, ctx: object) => unknown
type Surface = Record<string, unknown>

interface BuildState {
  readonly schema: StandardSchemaV1
  readonly guards: ReadonlyArray<AnyGuard>
  readonly prepare: ReadonlyArray<Prepare>
  readonly sinks: ReadonlyArray<SinkFactory>
}

// The runtime face of an extension: contributes methods over the shared state +
// a `rebuild` that reconstructs the composed builder (so `.body`/`.form`/
// `.params` chain).
export interface ScopeExtensionValue {
  methods(state: BuildState, rebuild: (state: BuildState) => Surface): Surface
  // The output channel this extension opens, if any. Injected by `.extend`, so
  // a scope that never extended it has neither the ctx entry nor the effect.
  readonly sink?: SinkFactory
}

function buildHandler(state: BuildState, leaf: AnyGuard): Handler<object, StandardSchemaV1, never> {
  return {
    schema: state.schema,
    guards: state.guards,
    leaf,
    // spread (not `key: undefined`) to respect exactOptionalPropertyTypes
    ...(state.prepare.length > 0 && { prepare: state.prepare }),
    ...(state.sinks.length > 0 && { sinks: state.sinks }),
  }
}

function make(state: BuildState, exts: readonly ScopeExtensionValue[]): Surface {
  const rebuild = (s: BuildState): Surface => make(s, exts)
  const base: Surface = {
    schema: state.schema,
    guard(g: AnyGuard) {
      return make({ ...state, guards: [...state.guards, g] }, exts)
    },
    handle(leaf: AnyGuard) {
      return buildHandler(state, leaf)
    },
    extend(ext: ScopeExtensionValue) {
      const next = ext.sink ? { ...state, sinks: [...state.sinks, ext.sink] } : state
      return make(next, [...exts, ext])
    },
  }
  return Object.assign(base, ...exts.map((e) => e.methods(state, rebuild)))
}

// Start a scope. `scope()` is the carrier-agnostic base (`.guard`/`.handle`/
// `.extend`) — it has NO input channel and no way to abort until it extends a
// carrier (`@lntt/scope/http`, …), which is correct: a scope with no carrier
// runs nowhere. Extensions compose and self-describe; the core names none.
export function scope(): Scope {
  return make({ schema: unit, guards: [], prepare: [], sinks: [] }, []) as unknown as Scope
}
