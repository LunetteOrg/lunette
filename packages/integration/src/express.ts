import { buildOnce, Lunette } from '@lntt/wire'
import type { PubOf, SeedOf } from '@lntt/wire'
import type {
  Request as ExReq,
  RequestHandler,
  Response as ExRes,
} from 'express'
import type { RouteParameters } from 'express-serve-static-core'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  IntentGuard,
  OutputOf,
  RequestCarrier,
} from '@lntt/scope'
import { scope, runScope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { renderOutcome, toWebRequest } from './node.ts'

// Express is NOT Fetch-based: there is no Response to hand back, so the pack is
// the composition of the two node primitives (`./node.ts`) — lift the request
// into a Web `Request` (the scope speaks Fetch), write the outcome onto `res`.
// A Fastify or Koa pack is the same two calls.

// The app stashed on the request by `mount`, under whatever key the pack was
// given. Handlers never read it — it exists for code OUTSIDE a scope.
type WireReq = ExReq & Record<string, unknown>

export interface ExpressOptions {
  // Where `mount` stashes the app on the request. Default `'__wireApp'`; give
  // two packs in one app different keys.
  readonly contextKey?: string
}

// The set of intents THIS host renders — written out by hand (§34). Express
// is an HTTP host, so it renders `@lntt/scope/http`'s whole vocabulary.
type HttpIntents = 'status' | 'redirect' | 'ok-status'
// The capabilities Express's carrier actually supplies: it streams the
// request body into the Web Request (`body`), and can decorate the response.
type ExpressCaps = 'body' | 'cookies' | 'headers'

// ── the route gate — pattern vs `.params()` schema, WE WRITE NO PARSER ──────
// `RouteParameters` is `@types/express-serve-static-core`'s OWN reader (an
// explicit devDependency below), reused so this cannot drift from the router
// that actually matches paths at runtime — it understands `*path` and
// `{/:id}` (Express 5's optional group), cases a hand-rolled parser had to
// bail on.
declare const OPAQUE: unique symbol
type Opaque = typeof OPAQUE

// A NON-LITERAL path (built from a variable, or containing a runtime
// interpolation) makes `RouteParameters<P>` resolve to `ParamsDictionary`,
// whose `keyof` is the WIDE `string` — that must mean "no opinion", never
// "every name is missing" (checking a real schema's keys against a `string`
// key set the naive way would reject every schema, since nothing survives
// `Exclude<realKey, string>`). `string extends keyof RouteParameters<P>` is
// true ONLY in that wide case — a genuine param-less literal route's real key
// set is `never`, and `string extends never` is false, so the two are told
// apart the same way Hono's non-literal guard is.
type RouteParams<P extends string> = string extends keyof RouteParameters<P>
  ? Opaque
  : keyof RouteParameters<P>

// The reversed vacuous-truth check (decision 34's trap): a param-less route's
// REAL `RouteParams` is `never`, and `never extends Opaque` is VACUOUSLY
// TRUE — so writing this as `RouteParams<P> extends Opaque` would silently
// skip every param-less route. Only `Opaque extends RouteParams<P>` tells the
// two apart.
type Missing<P extends string, Par> = Opaque extends RouteParams<P>
  ? never
  : Exclude<RouteParams<P>, keyof Par>
type Extra<P extends string, Par> = Opaque extends RouteParams<P>
  ? never
  : Exclude<keyof Par, RouteParams<P>>

type PathGate<P extends string, Par> = [Missing<P, Par>] extends [never]
  ? [Extra<P, Par>] extends [never]
    ? unknown
    : `⛔ the schema declares a param this route does not have: ${Extra<P, Par> & string}`
  : `⛔ this route has a param the schema does not declare: ${Missing<P, Par> & string}`

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
  // The origin comes from EXPRESS, not from a policy of ours: `req.protocol` and
  // `req.host` are what `app.set('trust proxy')` configures, so an app that has
  // told Express which proxies to believe has told this pack too. `req.host`
  // carries the port; `req.hostname` does not, which is why it is the wrong one
  // here. An explicit `carrier.origin` still wins, for a host that wants it
  // pinned (§40).
  // There is no option to override this: Express already owns the decision, and
  // a second way to say the same thing is a second thing to keep in agreement.
  const originOf = (req: ExReq): string =>
    req.host ? `${req.protocol}://${req.host}` : 'http://localhost'

  // The `DepGuard<Pub, Need>` intersection fires the deps-vs-Pub brand.
  // `CarrierGuard`/`IntentGuard`: same rendered set as Hono (Express streams
  // the request body into the Web Request, so it PROVIDES `body`/`cookies`/
  // `headers`, and renders `@lntt/scope/http`'s whole vocabulary).
  // `PathGate<P, OutputOf<S>>`: the route pattern, taken HERE and returned to
  // be spread — `app.get(...w.handler('/posts/:postId', scope))` — so it is
  // written once and checked against the schema in both directions. Params
  // are STILL validated at RUNTIME by `runScope` (a bad/missing param → a
  // RETURNED 422 abort, which `renderOutcome` renders as 4xx) — the compile-
  // time gate catches a MISNAMED param, not a malformed one.
  // `renderOutcome` takes the node `ServerResponse` Express's `res` extends.
  const handler = <
    P extends string,
    Need extends object,
    S extends StandardSchemaV1,
    R,
    Cap extends Capability,
    Int extends PropertyKey,
  >(
    path: P,
    h: Handler<Need, S, R, Cap, Int> &
      DepGuard<Pub, Need> &
      CarrierGuard<Cap, ExpressCaps> &
      IntentGuard<Int, HttpIntents> &
      PathGate<P, OutputOf<S>>,
  ): readonly [P, RequestHandler] =>
    [
      path,
      async (req: ExReq, res: ExRes): Promise<void> =>
        renderOutcome(
          res,
          await runScope<RequestCarrier, S, R, ExpressCaps, {}, Cap>(
            h,
            (await ensure(() => seedFrom())).app as object,
            { request: toWebRequest(req, originOf(req)) },
            req.params,
          ),
        ),
    ] as const

  return { guard: base.guard, handle: base.handle, mount, handler, dispose }
}
