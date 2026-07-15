import type { StandardSchemaV1 } from '@standard-schema/spec'
import { type Abort, isAbort } from './abort.ts'
import type { Handler } from './scope.ts'
import type { CookieSink, Outcome, SetCookie } from './carrier.ts'
import { validateInput } from './validate.ts'

// The guard fold, shared by every host pack. It is a dialect fold over wire,
// not a wire chain: the onion cannot express a RETURNED abort (it requires
// `next`), so the scope tier runs guards as a typed imperative loop. The app is
// fetched by the adapter from the host context and threaded in here; the leaf
// never sees it. The cookie sink is created per invocation.
// `handler` is narrowed to its runtime fields only: the phantom `Need`/`R`
// markers make `Handler` invariant, so a `Handler<Need, S, R>` from any
// scope would not be assignable to a fixed `Handler<object, …, R>` — picking
// `guards`/`leaf` (which never depend on `Need`/`S`) sidesteps that.
export async function runFold<Carrier extends object, R>(
  handler: Pick<Handler<object, StandardSchemaV1, R>, 'guards' | 'leaf' | 'prepare'>,
  app: object,
  carrier: Carrier,
  params: object,
): Promise<Outcome<R>> {
  const pending: SetCookie[] = []
  const cookies: CookieSink = {
    set: (name, value, options = {}) => pending.push({ name, value, options }),
  }

  // Extension-contributed PREPARE steps run FIRST, over the raw carrier: each
  // enriches the ctx (e.g. the `body` extension parses the request body into
  // `ctx.body` / `ctx.form`) or RETURNS a 422 abort (the error convention). The
  // fold does not know what they do — param-only/bus scopes have none.
  const prep: Record<string, unknown> = {}
  for (const step of handler.prepare ?? []) {
    const out = await step(carrier)
    if (isAbort(out)) return { ok: false, abort: out as Abort, cookies: pending }
    Object.assign(prep, out)
  }

  // `ctx` merges the carrier, the cookie sink, the validated params, and the
  // prepare enrichments. Guards and the leaf both read `(app, ctx)`; enrichments
  // accumulate into ctx.
  const ctx = { ...carrier, cookies, params, ...prep }

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

// Validate the raw params against the scope's schema (→ a RETURNED 422 abort
// on failure), THEN fold. Used by the hosts WITHOUT a native validator (RR7,
// Express, bus); Hono and tRPC validate natively with the SAME schema and pass
// already-parsed params straight to `runFold`. `schema` joins the Pick so the
// validation and the fold share one object by construction.
export async function runScope<Carrier extends object, Sch extends StandardSchemaV1, R>(
  handler: Pick<Handler<object, Sch, R>, 'guards' | 'leaf' | 'schema' | 'prepare'>,
  app: object,
  carrier: Carrier,
  raw: unknown,
): Promise<Outcome<R>> {
  const v = await validateInput(handler.schema, raw)
  if (!v.ok) return { ok: false, abort: v.abort, cookies: [] }
  return runFold<Carrier, R>(handler, app, carrier, v.params as object)
}
