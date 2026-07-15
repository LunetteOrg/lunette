import { Lunette } from '@lntt/wire'
import type {
  Request as ExReq,
  RequestHandler,
  Response as ExRes,
} from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Capability, CarrierGuard, DepGuard, Handler, Outcome, RequestCarrier } from '@lntt/scope'
import { scope, runScope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { serializeCookie } from './http-codec.ts'

type PubOf<C> = C extends { build: (...a: never[]) => Promise<{ app: infer A }> } ? A : never
type SeedOf<C> = C extends Lunette<any, any, infer S> ? S : never

function buildOnce<C extends Lunette<any, any, any>>(chain: C) {
  type Built = Awaited<ReturnType<C['build']>>
  let built: Promise<Built> | undefined
  const build = chain.build.bind(chain) as unknown as (seed: SeedOf<C>) => Promise<Built>
  const ensure = (seed: SeedOf<C>): Promise<Built> => (built ??= build(seed))
  const dispose = async (): Promise<void> => {
    if (built) await (await built).dispose()
  }
  return { ensure, dispose }
}

// Express is NOT Fetch-based, so there is no Response to hand back — we lift its
// `req` into a Web `Request` (the scope speaks Fetch) and translate the outcome
// onto the node `res` directly.
const toWebRequest = (req: ExReq): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const method = req.method
  const init: RequestInit & { duplex?: 'half' } = { method, headers }
  // GET/HEAD carry no body. For the rest, stream the node request as the Web
  // Request body so the leaf can read `formData()` / `json()` / `text()`. The
  // `duplex: 'half'` option is required when a Request is built from a stream.
  if (method !== 'GET' && method !== 'HEAD') {
    ;(init as { body?: unknown }).body = req
    init.duplex = 'half'
  }
  return new Request(`http://localhost${req.originalUrl}`, init)
}

const renderExpress = (res: ExRes, outcome: Outcome<unknown>): void => {
  for (const cookie of outcome.cookies) res.append('Set-Cookie', serializeCookie(cookie))
  if (outcome.ok) {
    res.status(200).json(outcome.value)
    return
  }
  const { intent } = outcome.abort
  if (intent.kind === 'redirect') {
    res.redirect(intent.status, intent.location)
    return
  }
  if (intent.body !== undefined) res.status(intent.status).json(intent.body)
  else res.status(intent.status).end()
}

// The built app is attached to the express request by the mount middleware.
type WireReq = ExReq & { __wireApp?: unknown }

// Express pack. Takes the CHAIN, owns build-once, exposes the shared scope
// surface, a `mount` middleware, a per-handler `handler` factory, and
// `dispose`. Node has no per-request env — the seed is static (captured at
// startup), so `seedFrom` takes no argument.
export function express<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: () => SeedOf<C>,
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = scope().extend(request)

  // mount = the middleware registered ONCE. Ensures the build and attaches the
  // app to the request; the seed is static.
  const mount = (): RequestHandler => async (req, _res, next) => {
    ;(req as WireReq).__wireApp = (await ensure(seedFrom())).app
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
  const handler =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
      h: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies'>,
    ): RequestHandler =>
    async (req: ExReq, res: ExRes): Promise<void> =>
      renderExpress(
        res,
        await runScope<RequestCarrier, S, R>(
          h,
          (req as WireReq).__wireApp as object,
          { request: toWebRequest(req) },
          req.params,
        ),
      )

  return { guard: base.guard, handle: base.handle, mount, handler, dispose }
}
