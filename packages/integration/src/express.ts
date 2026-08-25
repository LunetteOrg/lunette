import { buildOnce, Lunette } from '@lntt/wire'
import type { PubOf, SeedOf } from '@lntt/wire'
import type {
  Request as ExReq,
  RequestHandler,
  Response as ExRes,
} from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Capability, CarrierGuard, DepGuard, Handler, RequestCarrier } from '@lntt/scope'
import { scope, runScope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { renderOutcome, toWebRequest, type NodeCarrierOptions } from './node.ts'

// Express is NOT Fetch-based: there is no Response to hand back, so the pack is
// the composition of the two node primitives (`./node.ts`) — lift the request
// into a Web `Request` (the scope speaks Fetch), write the outcome onto `res`.
// A Fastify or Koa pack is the same two calls.

// The app stashed on the request by `mount`, under whatever key the pack was
// given. Handlers never read it — it exists for code OUTSIDE a scope.
type WireReq = ExReq & Record<string, unknown>

export interface ExpressOptions {
  // How the request's origin is recovered — see `NodeCarrierOptions`. Worth
  // setting `allowedHosts` for any app whose scopes read `ctx.request.url`
  // beyond its path: `Host` is a client header, so unfiltered it can be spoofed.
  readonly carrier?: NodeCarrierOptions
  // Where `mount` stashes the app on the request. Default `'__wireApp'`; give
  // two packs in one app different keys.
  readonly contextKey?: string
}

// Express pack. Takes the CHAIN, owns build-once, exposes the shared scope
// surface, a per-handler `handler` factory, an OPTIONAL `mount` middleware, and
// `dispose`. Node has no per-request env — the seed is static (captured at
// startup), so `seedFrom` takes no argument.
export function express<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: () => SeedOf<C>,
  options: ExpressOptions = {},
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = scope().extend(request)
  const carrier = options.carrier ?? {}
  const key = options.contextKey ?? '__wireApp'

  // OPTIONAL. Handlers do not need it — each reads the app from THIS pack's
  // `ensure`. Register it only to reach the app OUTSIDE a scope: your own
  // middleware, a hand-written route, a healthcheck. Two packs in one app must
  // then take different `contextKey`s, since this slot is shared by whoever
  // writes it (§33).
  const mount = (): RequestHandler => async (req, _res, next) => {
    ;(req as WireReq)[key] = (await ensure(() => seedFrom())).app
    next()
  }

  // Per-handler factory. Returns a plain Express `RequestHandler`. Each handler
  // reads the app from THIS pack's `ensure` — the build-once handle it closes
  // over — so different chains genuinely can serve routes in the SAME app: there
  // is no shared slot on the request for a second pack to overwrite (§33).
  // The `DepGuard<Pub, Need>` intersection fires the deps-vs-Pub brand at the
  // `w.handler(...)` call site. There is NO compile-time path check — params
  // are validated at RUNTIME by `runScope` (a bad/missing param → a RETURNED
  // 422 abort, which `renderExpress` renders as 4xx).
  // Express streams the request body into the Web Request, so it PROVIDES the
  // `body` capability (`CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>` accepts body/form scopes).
  // `renderOutcome` takes the node `ServerResponse` Express's `res` extends.
  const handler =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
      h: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>,
    ): RequestHandler =>
    async (req: ExReq, res: ExRes): Promise<void> =>
      renderOutcome(
        res,
        await runScope<RequestCarrier, S, R>(
          h,
          (await ensure(() => seedFrom())).app as object,
          { request: toWebRequest(req, carrier) },
          req.params,
        ),
      )

  return { guard: base.guard, handle: base.handle, mount, handler, dispose }
}
