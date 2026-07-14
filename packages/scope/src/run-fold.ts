import type { StandardSchemaV1 } from '@standard-schema/spec'
import { type Abort, isAbort } from './abort.ts'
import type { Handler } from './fragment.ts'
import type { CookieSink, Outcome, SetCookie } from './scope.ts'
import { validateInput } from './validate.ts'

// The guard fold, shared by every host pack. It is a dialect fold over wire,
// not a wire chain: the onion cannot express a RETURNED abort (it requires
// `next`), so the scope tier runs guards as a typed imperative loop. The app is
// fetched by the adapter from the host context and threaded in here; the leaf
// never sees it. The cookie sink is created per invocation.
// `handler` is narrowed to its runtime fields only: the phantom `Need`/`R`
// markers make `Handler` invariant, so a `Handler<Need, S, R>` from any
// fragment would not be assignable to a fixed `Handler<object, …, R>` — picking
// `guards`/`leaf` (which never depend on `Need`/`S`) sidesteps that.
export async function runFold<S extends { cookies: CookieSink }, R>(
  handler: Pick<Handler<object, StandardSchemaV1, R>, 'guards' | 'leaf' | 'bodySchema' | 'formSchema'>,
  app: object,
  carrier: Omit<S, 'cookies'>,
  params: object,
): Promise<Outcome<R>> {
  const pending: SetCookie[] = []
  const cookies: CookieSink = {
    set: (name, value, options = {}) => pending.push({ name, value, options }),
  }

  // Declared body channels (design A): parse + validate the request body into
  // `ctx.body` / `ctx.form`. A malformed/invalid body is a RETURNED 422 abort
  // (the error convention), never a throw. Touched ONLY when the fragment
  // declared `.body`/`.form`, so param-only and bus fragments are untouched.
  // The runtime carrier holds a full `Request` even though the fragment's
  // `ctx.request` type is the headless `RequestHead`.
  const bodyBag: { body?: unknown; form?: unknown } = {}
  const req = (carrier as { request?: Request }).request
  if (handler.bodySchema) {
    const raw = req ? await req.json().catch(() => undefined) : undefined
    const v = await validateInput(handler.bodySchema, raw)
    if (!v.ok) return { ok: false, abort: v.abort, cookies: pending }
    bodyBag.body = v.params
  }
  if (handler.formSchema) {
    const raw = req ? Object.fromEntries(await req.formData()) : undefined
    const v = await validateInput(handler.formSchema, raw)
    if (!v.ok) return { ok: false, abort: v.abort, cookies: pending }
    bodyBag.form = v.params
  }

  // `ctx` merges the carrier, the cookie sink, the validated params, and the
  // declared body/form. Guards and the leaf both read `(app, ctx)`; enrichments
  // accumulate into ctx.
  const ctx = { ...carrier, cookies, params, ...bodyBag }

  let enrich: Record<string, unknown> = {}
  for (const g of handler.guards) {
    const out = await g(app, { ...ctx, ...enrich })
    if (isAbort(out)) return { ok: false, abort: out as Abort, cookies: pending }
    enrich = { ...enrich, ...(out as object) }
  }

  // The leaf is the use case: it declares its own deps, so it too receives the
  // app (typed as its declared subset) plus the enriched ctx.
  const result = await handler.leaf(app, { ...ctx, ...enrich })
  if (isAbort(result)) return { ok: false, abort: result as Abort, cookies: pending }
  return { ok: true, value: result as R, cookies: pending }
}

// Validate the raw params against the fragment's schema (→ a RETURNED 422 abort
// on failure), THEN fold. Used by the hosts WITHOUT a native validator (RR7,
// Express, bus); Hono and tRPC validate natively with the SAME schema and pass
// already-parsed params straight to `runFold`. `schema` joins the Pick so the
// validation and the fold share one object by construction.
export async function runScope<
  Carrier extends { cookies: CookieSink },
  Sch extends StandardSchemaV1,
  R,
>(
  handler: Pick<Handler<object, Sch, R>, 'guards' | 'leaf' | 'schema' | 'bodySchema' | 'formSchema'>,
  app: object,
  carrier: Omit<Carrier, 'cookies'>,
  raw: unknown,
): Promise<Outcome<R>> {
  const v = await validateInput(handler.schema, raw)
  if (!v.ok) return { ok: false, abort: v.abort, cookies: [] }
  return runFold<Carrier, R>(handler, app, carrier, v.params as object)
}
