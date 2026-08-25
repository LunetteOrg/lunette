import type { StandardSchemaV1 } from '@standard-schema/spec'
import { type Abort, isAbort } from './abort.ts'
import type { Handler } from './scope.ts'
import type { Outcome } from './carrier.ts'
import type { Sink } from './scope.ts'
import { validateInput } from './validate.ts'

// The guard fold, shared by every host pack. It is a dialect fold over wire,
// not a wire chain: the onion cannot express a RETURNED abort (it requires
// `next`), so the scope tier runs guards as a typed imperative loop. The app is
// fetched by the adapter from the host context and threaded in here; the leaf
// never sees it. Extension sinks are created per invocation.
// `handler` is narrowed to its runtime fields only: the phantom `Need`/`R`
// markers make `Handler` invariant, so a `Handler<Need, S, R>` from any
// scope would not be assignable to a fixed `Handler<object, …, R>` — picking
// `guards`/`leaf` (which never depend on `Need`/`S`) sidesteps that.
export async function runFold<Carrier extends object, R, Eff extends object = {}>(
  // `__eff` joins the Pick so `Eff` is INFERABLE: it is the only place the
  // effect map appears, and without it every outcome would come back with an
  // empty `effects`. Covariant (a plain optional field), so it does not bring
  // back the invariance the Pick exists to avoid.
  handler: Pick<
    Handler<object, StandardSchemaV1, R, never, Eff>,
    'guards' | 'leaf' | 'prepare' | 'sinks' | '__eff'
  >,
  app: object,
  carrier: Carrier,
  params: object,
): Promise<Outcome<R, Eff>> {
  // The extensions' output channels, instantiated per invocation. The fold knows
  // only the shape (`key`, `ctx`, `collect`), never what any of them mean: a
  // cookie jar and a header bag are indistinguishable from here.
  const sinks: readonly Sink[] = (handler.sinks ?? []).map((make) => make())
  const sinkCtx: Record<string, unknown> = {}
  for (const sink of sinks) sinkCtx[sink.key] = sink.ctx
  const effects = (): Eff => {
    const out: Record<string, unknown> = {}
    for (const sink of sinks) out[sink.key] = sink.collect()
    return out as Eff
  }

  // Extension-contributed PREPARE steps run FIRST, over the raw carrier: each
  // enriches the ctx (e.g. the `body` extension parses the request body into
  // `ctx.body` / `ctx.form`) or RETURNS a 422 abort (the error convention). The
  // fold does not know what they do — param-only/bus scopes have none.
  const prep: Record<string, unknown> = {}
  for (const step of handler.prepare ?? []) {
    const out = await step(carrier)
    if (isAbort(out)) return { ok: false, abort: out as Abort, effects: effects() }
    Object.assign(prep, out)
  }

  // `ctx` merges the carrier, the cookie sink, the validated params, and the
  // prepare enrichments. Guards and the leaf both read `(app, ctx)`; enrichments
  // accumulate into ctx.
  const ctx = { ...carrier, ...sinkCtx, params, ...prep }

  let enrich: Record<string, unknown> = {}
  for (const g of handler.guards) {
    const out = await g(app, { ...ctx, ...enrich })
    if (isAbort(out)) return { ok: false, abort: out as Abort, effects: effects() }
    enrich = { ...enrich, ...(out as object) }
  }

  // The leaf is the use case: it declares its own deps, so it too receives the
  // app (typed as its declared subset) plus the enriched ctx.
  const result = await handler.leaf(app, { ...ctx, ...enrich })
  if (isAbort(result)) return { ok: false, abort: result as Abort, effects: effects() }
  return { ok: true, value: result as R, effects: effects() }
}

// Validate the raw params against the scope's schema (→ a RETURNED 422 abort
// on failure), THEN fold. Used by the hosts WITHOUT a native validator (RR7,
// Express, bus); Hono and tRPC validate natively with the SAME schema and pass
// already-parsed params straight to `runFold`. `schema` joins the Pick so the
// validation and the fold share one object by construction.
export async function runScope<
  Carrier extends object,
  Sch extends StandardSchemaV1,
  R,
  Eff extends object = {},
>(
  handler: Pick<
    Handler<object, Sch, R, never, Eff>,
    'guards' | 'leaf' | 'schema' | 'prepare' | 'sinks' | '__eff'
  >,
  app: object,
  carrier: Carrier,
  raw: unknown,
): Promise<Outcome<R, Eff>> {
  const v = await validateInput(handler.schema, raw)
  // A schema failure short-circuits BEFORE any sink exists, so there is nothing
  // to collect: the effects are empty by construction.
  if (!v.ok) return { ok: false, abort: v.abort, effects: {} as Eff }
  return runFold<Carrier, R, Eff>(handler, app, carrier, v.params as object)
}
