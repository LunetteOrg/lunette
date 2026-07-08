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
  StandardSchemaV1,
} from '@trpc/server/unstable-core-do-not-import'
import { type Abort, isAbort } from '../scope/abort.ts'
import type { OutputOf } from '../scope/schema.ts'

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
