import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort } from './abort.ts'
import type { Capability } from './carrier.ts'
import { unit, type OutputOf } from './schema.ts'

// A PREPARE step, part of the extension SPI: reads the raw carrier (the host's
// full object, e.g. a Fetch `Request` with a readable body) and returns an
// enrichment merged into `ctx`, or an `Abort`. Extensions push these to run
// carrier-reading work (body parsing) BEFORE the guard fold, without the core
// knowing what they do.
export type Prepare = (carrier: object) => Promise<object | Abort> | object | Abort

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

// The abstract scope: an input schema + a guard/leaf stack captured as data,
// bound to NO app. `Handler` carries the REAL input `schema` (the object a
// host hands to its native validator) alongside phantom markers. `__need` and
// `__result` stay phantom and LOAD-BEARING: drop them and two Handlers with the
// same schema become structurally identical, the adapter infers `unknown`, and
// the deps check silently disables (spike 1, caveat 2). The `schema` field is
// what pins `InferInput`/`InferOutput` for every host's native validator.
export interface Handler<
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability = never,
  Eff extends object = {},
> {
  readonly schema: S
  // Extension-contributed PREPARE steps: they read the raw carrier (before the
  // headless ctx is built) and enrich the ctx, or RETURN an `Abort` (a 422). The
  // core neither knows nor names what they do — the `body` extension's `.body`/
  // `.form` push steps that parse the request body into `ctx.body` / `ctx.form`.
  // This keeps the core `Handler` and the fold extension-agnostic.
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
  // to everything. Protected on both moves versus neither (§34). Measured: 7
  // extra instantiations across @lntt/integration, 0.003%.
  readonly __cap?: (c: Cap) => Cap
  // Phantom, load-bearing: the shape of `outcome.effects` for THIS scope, so a
  // host reads `effects.cookies` typed, and a scope that never injected the
  // extension has no such key to read.
  readonly __eff?: Eff
}

// ── The extension SPI ────────────────────────────────────────────────────────
// The builder is a small runtime composing a BASE surface (`.input`/`.guard`/
// `.handle`) with any injected EXTENSIONS. A carrier — the HTTP `request`
// extension in `@lntt/scope/request`, the bus at #10 — lives in its OWN
// tree-shakable subpath and is NEVER named by this core. An extension declares,
// PURELY AS PHANTOM DATA, what it contributes on four axes: fluent `methods`,
// `__ctx` (extra ctx fields), `__need` (extra app deps), `__caps` (capabilities);
// the core reads them back generically off `Self`. Adding a carrier is a new
// subpath, ZERO change here (principle 6 / §10).
//
// Every method takes an explicit `this: Self` so the accumulated state is read
// from a normal type parameter (`Self`), sidestepping TypeScript's `this`-type
// query restrictions. This is the ONE idiom the whole builder follows.

// Phantom accumulators, extracted by the aliases below. Covariant carriers
// (`__acc`/`__ctx`/`__need`/`__schema`) accumulate by INTERSECTION; the
// contravariant... no — `__caps` is an object MAP whose KEYS are the caps, so it
// too intersects covariantly and the union is read with `keyof`.
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type CtxOf<T> = T extends { readonly __ctx?: infer C } ? (C extends object ? C : {}) : {}
type NeedOf<T> = T extends { readonly __need?: infer N } ? (N extends object ? N : {}) : {}
type SchemaOf<T> = T extends { readonly __schema?: infer S }
  ? S extends StandardSchemaV1
    ? S
    : UnitSchema
  : UnitSchema
type ParamsOf<T> = OutputOf<SchemaOf<T>>
// An extension's own capability names, carried through as they are: `& string`
// drops symbol/number keys and nothing else. It must NOT filter against a list
// the core keeps — that is what silently turned an unknown capability into
// `never` and opened the mount gate (see `Capability` in carrier.ts).
type CapsOf<T> = T extends { readonly __caps?: infer M } ? (keyof M & string) : never
// The effect map: every injected extension's `__effects` intersected, so
// `outcome.effects` carries exactly the keys THIS scope can produce.
type EffOf<T> = T extends { readonly __effects?: infer E } ? (E extends object ? E : {}) : {}
type MethodsOf<T> = T extends { readonly __methods?: infer M } ? keyof M : never

// The unit schema type: a scope that never calls `.input` runs with `P = {}`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type UnitSchema = StandardSchemaV1<{}, {}>

// The ctx a guard/leaf reads: the validated `params` + every extension's ctx
// (`__ctx` — `request`, `cookies`, …) + every prior guard enrichment (`__acc`).
// The agnostic base commits to no carrier, so it adds nothing of its own.
type Ctx<Self> = { readonly params: ParamsOf<Self> } & CtxOf<Self> & AccOf<Self>

// An extension is a value the core composes. It declares its face by the phantom
// axes it carries (`__ctx`/`__need`/`__caps`/`__methods`) plus its fluent methods;
// `Redefines` reads `__methods` to reject an extension that re-declares a method
// already present (§4: a compile error naming the method, at the `.extend` call).
export interface ScopeExtension {
  readonly __ctx?: object
  readonly __need?: object
  readonly __caps?: object
  readonly __methods?: object
  // What this extension deposits in `outcome.effects`, keyed by its own name.
  readonly __effects?: object
}
type Redefines<Self, F> = Extract<MethodsOf<F>, MethodsOf<Self>>

// The builder. `S` never appears as a parameter — the schema, like every other
// axis, lives in a phantom (`__schema`) read via `Self`, so `.input`/`.guard`/
// `.extend`/`.handle` all return `Self & <delta>` and never drop an extension's
// methods (no per-carrier `guard` override — the point).
export interface Scope {
  readonly __schema?: StandardSchemaV1
  readonly __acc?: object
  readonly __ctx?: object
  readonly __need?: object
  readonly __caps?: object
  readonly __methods?: object
  readonly __effects?: object

  // `.input` fixes the params schema (first call wins; a second intersects and
  // is a user error). Its OUTPUT is `ctx.params` for every guard and the leaf.
  input<X extends StandardSchemaV1, Self = this>(this: Self, schema: X): Self & { readonly __schema?: X }

  // A guard: reads `(deps, ctx)`, returns an enrichment `E` (merged into ctx for
  // later steps) or a RETURNED `Abort`. `deps` — the declared app requirement —
  // accumulates into `__need`; `E` into `__acc`.
  guard<Need2 extends object, E extends object, Self = this>(
    this: Self,
    g: (deps: Need2, ctx: Ctx<Self>) => E | Abort | Promise<E | Abort>,
  ): Self & { readonly __acc?: E; readonly __need?: Need2 }

  // The leaf IS the use case: it declares its own deps and returns a domain
  // `R | Abort`. `handle` reads the accumulated axes off `Self` and produces a
  // CONCRETE `Handler` the adapters consume.
  handle<Need2 extends object, R, Self = this>(
    this: Self,
    leaf: (deps: Need2, ctx: Ctx<Self>) => R | Abort | Promise<R | Abort>,
  ): Handler<NeedOf<Self> & Need2, SchemaOf<Self>, R, CapsOf<Self>, EffOf<Self>>

  // Inject an extension. Composes its methods + ctx/need/caps onto the builder.
  // Rejected at THIS call site if it redefines a method already present (§4).
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
// a `rebuild` that reconstructs the composed builder (so `.body`/`.form` chain).
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
    input(schema: StandardSchemaV1) {
      return make({ ...state, schema }, exts)
    },
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

// Start a scope. `scope()` is the carrier-agnostic base (`.input`/`.guard`/
// `.handle`); `.extend(ext)` injects a carrier capability (`request`, `body`,
// `cookies`, … each its own tree-shakable subpath). Extensions compose and
// self-describe; the core names none.
export function scope(): Scope {
  return make({ schema: unit, guards: [], prepare: [], sinks: [] }, []) as unknown as Scope
}
