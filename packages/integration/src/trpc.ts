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
import type { Abort, Capability, CarrierGuard, Handler, OutputOf, RequestScope } from '@lntt/scope'
import { isAbort, runFold } from '@lntt/scope'

// The schema OUTPUT is the ctx.input type — the SAME projection guards and leaf
// read on every other host. tRPC's `.input(schema)` consumes the identical
// schema object natively as its validator.
export type InputOf<S extends StandardSchemaV1> = OutputOf<S>

const CODE_BY_STATUS: Record<number, TRPCError['code']> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_CONTENT',
}

// The one convention-translation point: a RETURNED domain Abort → a THROWN
// TRPCError. A redirect has no RPC status — over RPC it degrades to a domain
// error carrying the location for the client to act on (redirects are an HTTP
// concern).
export function abortToTRPCError(abort: Abort): TRPCError {
  const intent = abort.intent
  if (intent.kind === 'redirect') {
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: intent.location })
  }
  const code = CODE_BY_STATUS[intent.status] ?? 'BAD_REQUEST'
  return typeof intent.body === 'string'
    ? new TRPCError({ code, message: intent.body })
    : new TRPCError({ code })
}

// guard → middleware. `Ctx` is the accumulated deps so far (app singletons +
// prior guards' enrichment); the guard reads them plus the validated `input`
// and returns an enrichment `E` (merged into ctx via `next({ ctx })`, so the
// next guard/leaf sees it typed — `E` lands in `$ContextOverridesOut`) or an
// `Abort` (thrown). `Ctx` is annotated at each `.use` step (the honest
// limitation — see §3.4 of the round blueprint: tRPC cannot infer the
// accumulated ctx from a pre-applied wrapper; reuse is at the guard-FUNCTION
// level, feeding the same consts here and to `fragment().input(s).guard(...)`).
export function guard<Ctx, In, E extends object>(
  run: (deps: Ctx & { readonly input: In }) => Promise<E | Abort> | E | Abort,
): MiddlewareFunction<Ctx, object, object, E, In> {
  return async (opts) => {
    const out = await run({ ...(opts.ctx as Ctx), input: opts.input as In })
    if (isAbort(out)) throw abortToTRPCError(out)
    return opts.next({ ctx: out })
  }
}

// leaf → resolver. Reads the final deps ({ input } + accumulated ctx) and
// returns `R` (→ RPC output; `$Output = R`) or throws on Abort. The resolver
// NEVER returns an Abort — that path always throws — so `$Output = R` cleanly.
export function leaf<Ctx, In, R>(
  run: (deps: Ctx & { readonly input: In }) => Promise<R | Abort> | R | Abort,
): (opts: { ctx: Ctx; input: In }) => Promise<R> {
  return async (opts) => {
    const out = await run({ ...opts.ctx, input: opts.input })
    if (isAbort(out)) throw abortToTRPCError(out)
    return out
  }
}

// toProcedure — the whole-fragment shortcut. `guard`/`leaf` above wrap ONE
// decision each and are folded into a native procedure BY HAND with per-step
// ctx annotations; `toProcedure` consumes an entire fragment `Handler` in ONE
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
// inference survives. The context is constrained to carry the fragment's
// carrier field(s) — for the HTTP `RequestScope` fragment that is `request` —
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
  // tRPC has ONE JSON `input`, no separate readable body — its carrier provides
  // NO capabilities (`CarrierGuard<Cap, never>`). A fragment that declared
  // `.body`/`.form` (Cap ⊇ 'body') is a COMPILE ERROR here, at the mount site,
  // naming the missing capability — instead of silently reading an empty body.
  handler: Handler<Need, S, R, Cap> & CarrierGuard<Cap, never>,
) {
  return procedure.input(handler.schema).query(async (opts): Promise<R> => {
    // `opts` is contextually typed by tRPC's resolver signature; the constraint
    // `TContext extends { request: Request }` guarantees the carrier is present,
    // but a generic override could in principle re-type it, so read it through a
    // local view. `input` is the schema OUTPUT (`OutputOf<S>`).
    const ctx = opts.ctx as { request: Request }
    const outcome = await runFold<RequestScope, R>(
      handler,
      ctx,
      { request: ctx.request },
      opts.input as object,
    )
    if (!outcome.ok) throw abortToTRPCError(outcome.abort)
    return outcome.value
  })
}

// toMutation — the WRITE counterpart of `toProcedure`. Identical fold, but a
// native `.mutation` (a POST over the RPC transport, not a cacheable GET), so a
// value-returning write is exposed with the right RPC semantics and the client
// calls it via `.mutate`. A write fragment authored for RPC declares its WHOLE
// input as the payload (`.input`, never `.body`), so it carries NO `body`
// capability and passes the same `CarrierGuard<Cap, never>` gate; a `.body`
// fragment is still rejected here. Cookie/redirect writes stay HTTP-only — they
// have no RPC meaning (a redirect already degrades under `abortToTRPCError`).
export function toMutation<
  TContext extends { request: Request },
  TMeta,
  TContextOverrides,
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
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
  handler: Handler<Need, S, R, Cap> & CarrierGuard<Cap, never>,
) {
  return procedure.input(handler.schema).mutation(async (opts): Promise<R> => {
    const ctx = opts.ctx as { request: Request }
    const outcome = await runFold<RequestScope, R>(
      handler,
      ctx,
      { request: ctx.request },
      opts.input as object,
    )
    if (!outcome.ok) throw abortToTRPCError(outcome.abort)
    return outcome.value
  })
}
