import { type Abort, isAbort } from './abort.ts'
import type { CookieSink, Outcome, SetCookie } from './scope.ts'
import type { Handler } from './fragment.ts'

// The guard fold, shared by every host pack. It is a dialect fold over wire,
// not a wire chain: the onion cannot express a RETURNED abort (it requires
// `next`), so the scope tier runs guards as a typed imperative loop. The app is
// fetched by the adapter from the host context and threaded in here; the leaf
// never sees it. The cookie sink is created per invocation.
// `handler` is narrowed to its runtime fields only: the phantom `Need`/`P`
// markers make `Handler` invariant, so a `Handler<Need, P, R>` from any
// fragment would not be assignable to a fixed `Handler<object, object, R>` —
// picking `guards`/`leaf` (which never depend on `Need`/`P`) sidesteps that.
export async function runFold<S extends { cookies: CookieSink }, R>(
  handler: Pick<Handler<object, object, R>, 'guards' | 'leaf'>,
  app: object,
  carrier: Omit<S, 'cookies'>,
  params: object,
): Promise<Outcome<R>> {
  const pending: SetCookie[] = []
  const cookies: CookieSink = {
    set: (name, value, options = {}) => pending.push({ name, value, options }),
  }
  const ctx = { ...carrier, cookies }

  let enrich: Record<string, unknown> = {}
  for (const g of handler.guards) {
    const out = await g(app, params, { ...ctx, ...enrich })
    if (isAbort(out)) return { ok: false, abort: out as Abort, cookies: pending }
    enrich = { ...enrich, ...(out as object) }
  }

  const result = await handler.leaf({ ...ctx, ...enrich }, params)
  if (isAbort(result)) return { ok: false, abort: result as Abort, cookies: pending }
  return { ok: true, value: result as R, cookies: pending }
}
