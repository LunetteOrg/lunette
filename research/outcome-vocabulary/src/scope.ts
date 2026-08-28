// THE BUILDER. Still no vocabulary: `scope()` on its own cannot even read an
// input, because an input channel belongs to a carrier too (route params on
// HTTP, the payload on RPC, the message body on a queue).
import {
  type Abort,
  type IntentKeysOf,
  type IntentMap,
  type Issue,
  type Ok,
  type Outcome,
  type ValueOf,
  isAbort,
  isOk,
} from './kernel.ts'

// ── the phantoms, read with `keyof` so they stay NAMEABLE ────────────────────
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type CtxOf<T> = T extends { readonly __ctx?: infer C } ? (C extends object ? C : {}) : {}
type ParamsOf<T> = T extends { readonly __params?: infer P } ? P : undefined
// What the guards and the leaf actually PRODUCE.
type IntentsOf<T> = T extends { readonly __intents?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never
// What the scope DECLARED, by extending a carrier.
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never

export type Ctx<Self> = { readonly params: ParamsOf<Self> } & CtxOf<Self> & AccOf<Self>

// ── gate 1: the SCOPE does not handle that verb ──────────────────────────────
// It rides the ARGUMENT, not the return type. The return-type form is cheaper
// (~616 instantiations per scope against ~780) and was tried first, but it
// only fires when the NEXT call in the chain touches the poisoned type — so a
// BASE (`gated()` in a real app: extends and guards, no `.handle`) swallows the
// mistake entirely and surfaces it later, in whichever file finally calls
// `.handle`, pointing at a guard its author never wrote. On the argument the
// error lands on the guard that is actually wrong, wherever the chain stops.
//
// §39(b) warns against brands on the return type for the same reason, and its
// other trap does not apply here: this gate is a CONDITIONAL over `R`, which is
// not an inference site, so `R` still infers from the function's return.
// `A` and `U` are defaulted parameters used as let-bindings, so `Awaited<R>` and
// the missing-intent set are each computed ONCE instead of per mention. They sit
// on the ALIAS, never on the method: a defaulted parameter in a method's own
// list is caller-overridable, and `guard<…, never>(bad)` then walks straight
// through the gate AND empties the accumulated set — measured, and the same
// fail-open decision 34 had to close on the capability axis.
type DeclGate<Self, R, A = Awaited<R>, U = Exclude<IntentKeysOf<A>, DeclaredOf<Self>>> = [
  U,
] extends [never]
  ? unknown
  : `⛔ this scope does not declare the intent: ${U & string} — did you forget to .extend() the carrier that coins it?`

type GuardAcc<Self, R, A = Awaited<R>> = Self & {
  readonly __acc?: ValueOf<A>
  readonly __intents?: IntentMap<IntentKeysOf<A> & PropertyKey>
}

type HandleOut<Self, R, A = Awaited<R>> = Handler<
  ValueOf<A>,
  IntentsOf<Self> | IntentKeysOf<A>,
  ParamsOf<Self>
>

// ── gate 2: the HOST does not handle that scope ──────────────────────────────
// Cannot move earlier: the same scope is correct on another host, and the
// definition line holds no information about where it will be mounted.
export type MountGate<Int, HostInt> = [Exclude<Int, HostInt>] extends [never]
  ? unknown
  : `⛔ this host cannot render the intent: ${Exclude<Int, HostInt> & string}`

export interface Handler<R, Int, Par = unknown> {
  readonly guards: ReadonlyArray<(ctx: object) => unknown>
  readonly leaf: (ctx: object) => unknown
  readonly schema: Schema<unknown> | undefined
  readonly __r?: R
  readonly __par?: (p: Par) => Par
  // Invariant, so naming the type argument by hand cannot declare the gate away
  // — the hole decision 34 had to close on the capability axis.
  readonly __int?: (i: Int) => Int
}

// A stand-in for Standard Schema: enough to fail, and to carry issues.
export interface Schema<T> {
  parse(raw: unknown): { ok: true; value: T } | { ok: false; issues: readonly Issue[] }
}

export interface ScopeExtension {
  readonly __ctx?: object
  readonly __declares?: object
  readonly __params?: unknown
}

export interface Scope {
  readonly __acc?: object
  readonly __ctx?: object
  readonly __intents?: object
  readonly __declares?: object
  readonly __params?: unknown

  extend<F extends object, Self = this>(this: Self, ext: F): Self & F

  guard<R, Self = this>(
    this: Self,
    g: ((ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): GuardAcc<Self, R>

  handle<R, Self = this>(
    this: Self,
    leaf: ((ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): HandleOut<Self, R>
}

// ── runtime ──────────────────────────────────────────────────────────────────
export interface BuildState {
  readonly guards: ReadonlyArray<(ctx: object) => unknown>
  readonly schema: Schema<unknown> | undefined
  readonly ctx: Readonly<Record<string, unknown>>
}

export interface ScopeExtensionValue {
  methods(state: BuildState, rebuild: (s: BuildState) => object): object
  readonly ctx?: Readonly<Record<string, unknown>>
}

const build = (state: BuildState, exts: ScopeExtensionValue[]): object => {
  const base = {
    guard: (g: (ctx: object) => unknown) =>
      build({ ...state, guards: [...state.guards, g] }, exts),
    handle: (leaf: (ctx: object) => unknown) => ({
      guards: state.guards,
      leaf,
      schema: state.schema,
    }),
    extend: (ext: ScopeExtensionValue) => {
      const next = [...exts, ext]
      return build({ ...state, ctx: { ...state.ctx, ...(ext.ctx ?? {}) } }, next)
    },
  }
  const rebuild = (s: BuildState) => build(s, exts)
  return Object.assign(base, ...exts.map((e) => e.methods(state, rebuild)))
}

export const scope = (): Scope =>
  build({ guards: [], schema: undefined, ctx: {} }, []) as unknown as Scope

// ── the fold ─────────────────────────────────────────────────────────────────
// It knows `isAbort` and `isOk` and nothing else. It never reads an intent.
export async function runScope<R>(
  handler: Pick<Handler<R, never>, 'guards' | 'leaf' | 'schema'>,
  raw: unknown,
  carrierCtx: Readonly<Record<string, unknown>> = {},
): Promise<Outcome<R>> {
  let params: unknown = raw
  if (handler.schema) {
    const parsed = handler.schema.parse(raw)
    // The fold failing ON ITS OWN: not an abort, a third branch. The core does
    // not decide this is worth 422 — a codec does.
    if (!parsed.ok) return { ok: false, invalid: { issues: parsed.issues } }
    params = parsed.value
  }

  let ctx: Record<string, unknown> = { ...carrierCtx, params }
  for (const g of handler.guards) {
    const out = await g(ctx)
    if (isAbort(out)) return { ok: false, abort: out }
    ctx = { ...ctx, ...(out as object) }
  }

  const result = await handler.leaf(ctx)
  if (isAbort(result)) return { ok: false, abort: result }
  if (isOk(result)) return { ok: true, value: result.value as R, intent: result.intent }
  return { ok: true, value: result as R, intent: undefined }
}

export type { Abort, Ok, Outcome }
