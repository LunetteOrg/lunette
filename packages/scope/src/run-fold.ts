import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isAbort, isOk, type Abort, type Ok } from './abort.ts'
import type { CarrierGuard } from './adapter-guard.ts'
import type { Capability, Invalid, Outcome } from './carrier.ts'
import type { Handler, Sink } from './scope.ts'
import { validateInput } from './validate.ts'

// A value straight off a `Prepare` step is a plain enrichment object, an
// `Abort`, or an `Invalid` — the fold tells them apart the same way it tells a
// guard/leaf result apart, isAbort/isOk plus this one structural check for the
// core's OWN failure shape (not a carrier's vocabulary, so no brand is needed
// for it — see `carrier.ts`'s `Invalid`).
const isInvalid = (x: unknown): x is Invalid =>
  typeof x === 'object' && x !== null && 'issues' in x && !isAbort(x) && !isOk(x)

// The guard fold, shared by every host pack. It is a dialect fold over wire,
// not a wire chain: the onion cannot express a RETURNED abort (it requires
// `next`), so the scope tier runs guards as a typed imperative loop. The app is
// fetched by the adapter from the host context and threaded in here; the leaf
// never sees it. Extension sinks are created per invocation.
// `handler` is narrowed to its runtime fields only: the phantom `Need`/`R`
// markers make `Handler` invariant, so a `Handler<Need, S, R>` from any
// scope would not be assignable to a fixed `Handler<object, …, R>` — picking
// `guards`/`leaf` (which never depend on `Need`/`S`) sidesteps that.
//
// `Cap`/`HostCaps` gate this the same way a mount does: `Cap` is inferred off
// `handler.__cap` (picked below, unlike before — its absence was a hole: `Cap`
// used to be pinned to `never` and the brand vanished), `HostCaps` is NOT
// inferable from anything and must be NAMED by the caller — a hand-wired host
// stating the capabilities its carrier actually supplies, the same claim a
// `@lntt/integration` mount makes about its machinery (`carrier.ts`).
export async function runFold<
  Carrier extends object,
  R,
  HostCaps extends Capability = never,
  Eff extends object = {},
  Cap extends Capability = never,
>(
  // `__eff`/`__cap` join the Pick so `Eff`/`Cap` are INFERABLE: without them
  // every outcome would come back with an empty `effects`, and every handler
  // would satisfy `CarrierGuard` vacuously regardless of what it requires.
  // Covariant/invariant as declared on `Handler` — picking them does not change
  // that.
  handler: Pick<
    Handler<object, StandardSchemaV1, R, Cap, never, Eff>,
    'guards' | 'leaf' | 'prepare' | 'sinks' | '__eff' | '__cap'
  > &
    CarrierGuard<Cap, HostCaps>,
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
  // `ctx.body` / `ctx.form`), RETURNS an abort, or RETURNS the core's own
  // `invalid` branch (a schema failure discovered inside the step). The fold
  // does not know what an abort MEANS — param-only/bus scopes have no prepare
  // steps at all.
  const prep: Record<string, unknown> = {}
  for (const step of handler.prepare ?? []) {
    const out = await step(carrier)
    if (isAbort(out)) return { ok: false, abort: out as Abort<never>, effects: effects() }
    if (isInvalid(out)) return { ok: false, invalid: out, effects: effects() }
    Object.assign(prep, out)
  }

  // `ctx` merges the carrier, the extension sinks, the validated params, and the
  // prepare enrichments. Guards and the leaf both read `(app, ctx)`; enrichments
  // accumulate into ctx.
  const ctx = { ...carrier, ...sinkCtx, params, ...prep }

  let enrich: Record<string, unknown> = {}
  for (const g of handler.guards) {
    const out = await g(app, { ...ctx, ...enrich })
    if (isAbort(out)) return { ok: false, abort: out as Abort<never>, effects: effects() }
    enrich = { ...enrich, ...(out as object) }
  }

  // The leaf is the use case: it declares its own deps, so it too receives the
  // app (typed as its declared subset) plus the enriched ctx. Its result is
  // either an abort, an `Ok` carrying its own success intent (`json(v, 201)`),
  // or a plain domain value — the fold never reads what an intent MEANS,
  // only whether the brand is present.
  const result = await handler.leaf(app, { ...ctx, ...enrich })
  if (isAbort(result)) return { ok: false, abort: result as Abort<never>, effects: effects() }
  if (isOk(result)) {
    const ok = result as Ok<unknown, never>
    return { ok: true, value: ok.value as R, intent: ok.intent, effects: effects() }
  }
  return { ok: true, value: result as R, intent: undefined, effects: effects() }
}

// Validate the raw params against the scope's schema (→ the `invalid` outcome
// branch on failure), THEN fold. Used by the hosts WITHOUT a native validator
// (RR7, Express, bus); Hono and tRPC validate natively with the SAME schema and
// pass already-parsed params straight to `runFold`. `schema` joins the Pick so
// the validation and the fold share one object by construction.
export async function runScope<
  Carrier extends object,
  Sch extends StandardSchemaV1,
  R,
  HostCaps extends Capability = never,
  Eff extends object = {},
  Cap extends Capability = never,
>(
  handler: Pick<
    Handler<object, Sch, R, Cap, never, Eff>,
    'guards' | 'leaf' | 'schema' | 'prepare' | 'sinks' | '__eff' | '__cap'
  > &
    CarrierGuard<Cap, HostCaps>,
  app: object,
  carrier: Carrier,
  raw: unknown,
): Promise<Outcome<R, Eff>> {
  const v = await validateInput(handler.schema, raw)
  // A schema failure short-circuits BEFORE any sink exists, so there is nothing
  // to collect: the effects are empty by construction.
  if (!v.ok) return { ok: false, invalid: { issues: v.issues }, effects: {} as Eff }
  return runFold<Carrier, R, HostCaps, Eff, Cap>(handler, app, carrier, v.params as object)
}
