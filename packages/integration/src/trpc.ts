// The tRPC host pack. Same lesson as Hono: DO NOT wrap the router. The pack
// contributes three wrappers — `abortToTRPCError`, `guard`, `leaf` — plus the
// `InputOf` projection; the procedure is assembled NATIVELY
// (`.input().use()…query()`), which is exactly what preserves a typed
// `AppRouter` + `createCaller`/`createTRPCClient` end to end.
//
// The pivot (design principle 3): our world speaks in RETURNED values — a
// guard/leaf hands back an `Abort` to short-circuit (domain: 4xx). tRPC has one
// abort channel only: THROW a TRPCError. So this pack is the exact place the
// convention is translated — a RETURNED Abort becomes a THROWN TRPCError with a
// specific 4xx code (domain), while an actual THROW from a guard/leaf stays
// infrastructure and tRPC surfaces it as INTERNAL_SERVER_ERROR.

import { TRPCError } from '@trpc/server'
// `MiddlewareFunction` / `StandardSchemaV1` are the core builder types tRPC uses
// internally; they live behind the `unstable-core-do-not-import` entry (the
// public `.` surface re-exports only a subset). Importing them here lets `.use()`
// accumulate our enrichment into ctx exactly like a native middleware — WITHOUT
// `MiddlewareFunction` typing the guard, `.use()` infers
// `$ContextOverridesOut = {}` and ALL ctx accumulation is silently lost. Type-
// only imports, no runtime coupling.
import type {
  MiddlewareFunction,
  ProcedureBuilder,
  StandardSchemaV1,
  UnsetMarker,
} from '@trpc/server/unstable-core-do-not-import'
import type {
  Abort,
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  IntentGuard,
  Issue,
  Outcome,
  OutputOf,
  RequestCarrier,
} from '@lntt/scope'
import { isAbort, runFold } from '@lntt/scope'
import type { RpcIntent } from '@lntt/scope/trpc'

// The schema OUTPUT is the ctx.input type — the SAME projection guards and leaf
// read on every other host. tRPC's `.input(schema)` consumes the identical
// schema object natively as its validator.
export type InputOf<S extends StandardSchemaV1> = OutputOf<S>

// The set of intents THIS host renders — the mount-side gate's other half,
// written out by hand (§34: supply is closed per mount). tRPC renders ONLY
// its own carrier's word: no `redirect`, no `ok-status` (an RPC reply has no
// status line to put one in) — those are `@lntt/scope/http`'s words, and a
// scope built with `.extend(http)` is REJECTED here, at the mount, naming the
// intent it cannot render.
type RpcIntents = 'code'

// A narrow runtime check for `@lntt/scope/trpc`'s own shape — the ONE
// vocabulary this codec knows how to render.
const isRpcIntent = (intent: unknown): intent is RpcIntent =>
  typeof intent === 'object' && intent !== null && (intent as { kind?: unknown }).kind === 'code'

// The one convention-translation point: a RETURNED domain Abort → a THROWN
// TRPCError. `@lntt/scope/trpc`'s own codes ALREADY are tRPC's codes
// (`NOT_FOUND`, `UNAUTHORIZED`, …) — rendering this carrier's own vocabulary
// is spelling its words, not translating a lookup table, which is what makes
// today's incidental HTTP-status→tRPC-code mapping honest: there IS no
// mapping left to maintain.
//
// An intent this carrier does not recognise (e.g. a raw Abort built by hand,
// or `@lntt/scope/http`'s vocabulary reaching here despite the mount-side
// `IntentGuard`) is a THROW — infrastructure by the error convention
// (principle 3) — never a silent degradation into a code that means
// something else. The mount-side gate is what should have caught this
// earlier; reaching this branch means it was bypassed.
export function abortToTRPCError(abort: Abort<never>): TRPCError {
  const intent = abort.intent
  if (!isRpcIntent(intent)) {
    throw new Error(
      `@lntt/integration/trpc: cannot render intent — this carrier only knows @lntt/scope/trpc's own vocabulary: ${JSON.stringify(intent)}`,
    )
  }
  return new TRPCError(
    intent.message === undefined ? { code: intent.code } : { code: intent.code, message: intent.message },
  )
}

// guard → middleware. `Ctx` is the accumulated deps so far (app singletons +
// prior guards' enrichment); the guard reads them plus the validated `input`
// and returns an enrichment `E` (merged into ctx via `next({ ctx })`, so the
// next guard/leaf sees it typed — `E` lands in `$ContextOverridesOut`) or an
// `Abort` (thrown). `Ctx` is annotated at each `.use` step (the honest
// limitation — see §3.4 of the round blueprint: tRPC cannot infer the
// accumulated ctx from a pre-applied wrapper; reuse is at the guard-FUNCTION
// level, feeding the same consts here and to `scope().input(s).guard(...)`).
// `Abort<any>` here, not bare `Abort`: `run`'s literal caller can return ANY
// carrier's concrete Abort (`unauthorized()`, …), and `__i` is an invariant
// phantom — bare `Abort` (`Abort<UnknownIntent>`) would reject every one of
// them at this parameter position, the same trap a bare-`any` `infer` slot
// hits in the type-level gate (`intent-vocabulary.test-d.ts`'s header note).
// This helper has no definition-side gate of its own to begin with — it is
// native tRPC composition, not a `scope()` — so widening here loses nothing
// the gate would have checked.
export function guard<Ctx, In, E extends object>(
  run: (deps: Ctx & { readonly input: In }) => Promise<E | Abort<any>> | E | Abort<any>,
): MiddlewareFunction<Ctx, object, object, E, In> {
  return async (opts) => {
    const out = await run({ ...(opts.ctx as Ctx), input: opts.input as In })
    // Cast, not `isAbort`'s own narrowing: `out`'s declared type carries
    // `Abort<any>` as a union member, and `any` in the phantom's PARAMETER
    // position does not behave like a universal escape hatch under
    // `exactOptionalPropertyTypes` (the same invariant-phantom trap the
    // type-level gate works around with `infer`, not a fixed `any`). The
    // runtime check already proved `out` is an abort; the cast just states it.
    if (isAbort(out)) throw abortToTRPCError(out as Abort<never>)
    return opts.next({ ctx: out })
  }
}

// leaf → resolver. Reads the final deps ({ input } + accumulated ctx) and
// returns `R` (→ RPC output; `$Output = R`) or throws on Abort. The resolver
// NEVER returns an Abort — that path always throws — so `$Output = R` cleanly.
export function leaf<Ctx, In, R>(
  run: (deps: Ctx & { readonly input: In }) => Promise<R | Abort<any>> | R | Abort<any>,
): (opts: { ctx: Ctx; input: In }) => Promise<R> {
  return async (opts) => {
    const out = await run({ ...opts.ctx, input: opts.input })
    if (isAbort(out)) throw abortToTRPCError(out as Abort<never>)
    // `Abort<any>` in `run`'s declared union does not narrow away by
    // `Exclude` the way a concrete `Abort<X>` would (same root cause as the
    // cast above) — the runtime check already ruled it out.
    return out as R
  }
}

// A Standard Schema issue's `path` is OPTIONAL, and each segment may be a bare
// `PropertyKey` or a `{ key }` object — join defensively rather than assume
// the zod-flavoured shape every fixture happens to produce.
const pathOf = (issue: Issue): string =>
  (issue.path ?? [])
    .map((seg) => String(typeof seg === 'object' ? seg.key : seg))
    .join('.')

// Shared by `toProcedure`/`toMutation`: THREE branches, matching `Outcome`.
// The `invalid` case renders `UNPROCESSABLE_CONTENT` — tRPC's OWN choice for
// the core's schema-failure branch, made HERE (the codec), same as `422` is
// HTTP's choice in `@lntt/integration/http`. `validate.ts` never had an
// opinion; this is where one is decided.
function resultOf<R>(outcome: Outcome<R, object>): R {
  if (outcome.ok) return outcome.value
  if ('invalid' in outcome) {
    throw new TRPCError({
      code: 'UNPROCESSABLE_CONTENT',
      message: outcome.invalid.issues.map((i) => `${pathOf(i)}: ${i.message}`).join('; '),
    })
  }
  throw abortToTRPCError(outcome.abort)
}

// toProcedure — the whole-scope shortcut. `guard`/`leaf` above wrap ONE
// decision each and are folded into a native procedure BY HAND with per-step
// ctx annotations; `toProcedure` consumes an entire scope `Handler` in ONE
// call, with ZERO annotations, and STILL preserves the typed client. The
// resolver runs OUR fold inside a native `.input(schema).query(resolver)`, so
// tRPC infers the procedure INPUT from `.input(handler.schema)` and the OUTPUT
// from the resolver's `R` — `hc`/`createCaller` inference is untouched.
//
// `procedure` is typed as a FRESH builder (no input/output yet: `UnsetMarker`s;
// not a caller: `TCaller = false`) whose context/meta/overrides are inferred
// from the concrete `t.procedure` passed in — `AnyProcedureBuilder` cannot be
// used directly because its `TCaller = any` unions `.query`'s return into
// `(() => …) | QueryProcedure`, which `t.router({...})` rejects. Fixing the
// markers keeps `.input(schema).query(resolver)` returning a clean
// `QueryProcedure<{ input: InferInput<S>; output: R }>`, so `hc`/`createCaller`
// inference survives. The context is constrained to carry the scope's
// carrier field(s) — for the HTTP `RequestCarrier` scope that is `request` —
// so the resolver reads `ctx.request` and builds the carrier from it. A
// RETURNED domain Abort becomes a THROWN TRPCError (the convention-translation
// point); an actual throw stays infrastructure (INTERNAL_SERVER_ERROR).
export function toProcedure<
  TContext extends { request: Request },
  TMeta,
  TContextOverrides,
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
  Int extends PropertyKey,
>(
  procedure: ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    false
  >,
  // Three gates. `DepGuard` reconciles the scope's deps against the CONTEXT,
  // because on tRPC the context is where the app travels (§33) — there is no
  // pack holding a `Pub`, so `TContext` plays that role. `CarrierGuard`: tRPC
  // has ONE JSON `input`, no separate readable body, so its carrier provides
  // NO capabilities (`CarrierGuard<Cap, never>`) — a scope that declared
  // `.body`/`.form` (Cap ⊇ 'body') is a COMPILE ERROR here, naming the missing
  // capability. `IntentGuard`: tRPC renders ONLY its own carrier's vocabulary
  // (`RpcIntents`) — a scope built with `.extend(http)` (or any carrier other
  // than `@lntt/scope/trpc`) is rejected here too, naming the intent it
  // cannot render — instead of silently degrading at `abortToTRPCError`.
  handler: Handler<Need, S, R, Cap, Int> &
    DepGuard<TContext & TContextOverrides, Need> &
    CarrierGuard<Cap, never> &
    IntentGuard<Int, RpcIntents>,
) {
  return procedure.input(handler.schema).query(async (opts): Promise<R> => {
    // `opts` is contextually typed by tRPC's resolver signature; the constraint
    // `TContext extends { request: Request }` guarantees the carrier is present,
    // but a generic override could in principle re-type it, so read it through a
    // local view. `input` is the schema OUTPUT (`OutputOf<S>`).
    const ctx = opts.ctx as { request: Request }
    const outcome = await runFold<RequestCarrier, R, never, {}, Cap>(
      handler,
      ctx,
      { request: ctx.request },
      opts.input as object,
    )
    return resultOf(outcome)
  })
}

// toMutation — the WRITE counterpart of `toProcedure`. Identical fold, but a
// native `.mutation` (a POST over the RPC transport, not a cacheable GET), so a
// value-returning write is exposed with the right RPC semantics and the client
// calls it via `.mutate`. A write scope authored for RPC declares its WHOLE
// input as the payload (`.input`, never `.body`), so it carries NO `body`
// capability and passes the same `CarrierGuard<Cap, never>` gate; a `.body`
// scope is still rejected here. Cookie/redirect writes stay HTTP-only — a
// scope built with `.extend(http)` is rejected at `IntentGuard` before it
// ever reaches `abortToTRPCError` (redirect has no RPC meaning to degrade
// into).
export function toMutation<
  TContext extends { request: Request },
  TMeta,
  TContextOverrides,
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
  Int extends PropertyKey,
>(
  procedure: ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    false
  >,
  handler: Handler<Need, S, R, Cap, Int> &
    DepGuard<TContext & TContextOverrides, Need> &
    CarrierGuard<Cap, never> &
    IntentGuard<Int, RpcIntents>,
) {
  return procedure.input(handler.schema).mutation(async (opts): Promise<R> => {
    const ctx = opts.ctx as { request: Request }
    const outcome = await runFold<RequestCarrier, R, never, {}, Cap>(
      handler,
      ctx,
      { request: ctx.request },
      opts.input as object,
    )
    return resultOf(outcome)
  })
}
