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

// The built app is attached to the express request by the mount middleware.
type WireReq = ExReq & { __wireApp?: unknown }

// Express pack. Takes the CHAIN, owns build-once, exposes the shared scope
// surface, a `mount` middleware, a per-handler `handler` factory, and
// `dispose`. Node has no per-request env — the seed is static (captured at
// startup), so `seedFrom` takes no argument.
export function express<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: () => SeedOf<C>,
  // How the request's origin is recovered — see `NodeCarrierOptions`. Worth
  // setting `allowedHosts` for any app whose scopes read `ctx.request.url`
  // beyond its path: `Host` is a client header, so unfiltered it can be spoofed.
  carrier: NodeCarrierOptions = {},
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = scope().extend(request)

  // mount = the middleware registered ONCE. Ensures the build and attaches the
  // app to the request; the seed is static.
  const mount = (): RequestHandler => async (req, _res, next) => {
    ;(req as WireReq).__wireApp = (await ensure(() => seedFrom())).app
    next()
  }

  // Per-handler factory. Returns a plain Express `RequestHandler`, so DIFFERENT
  // chains can serve routes in the SAME app: `app.get(path, w.handler(frag))`.
  // The `DepGuard<Pub, Need>` intersection fires the deps-vs-Pub brand at the
  // `w.handler(...)` call site. There is NO compile-time path check — params
  // are validated at RUNTIME by `runScope` (a bad/missing param → a RETURNED
  // 422 abort, which `renderExpress` renders as 4xx).
  // Express streams the request body into the Web Request, so it PROVIDES the
  // `body` capability (`CarrierGuard<Cap, 'body' | 'cookies'>` accepts body/form scopes).
  // `renderOutcome` takes the node `ServerResponse` Express's `res` extends.
  const handler =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
      h: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies'>,
    ): RequestHandler =>
    async (req: ExReq, res: ExRes): Promise<void> =>
      renderOutcome(
        res,
        await runScope<RequestCarrier, S, R>(
          h,
          (req as WireReq).__wireApp as object,
          { request: toWebRequest(req, carrier) },
          req.params,
        ),
      )

  return { guard: base.guard, handle: base.handle, mount, handler, dispose }
}
