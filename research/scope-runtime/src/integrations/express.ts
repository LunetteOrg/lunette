import { Lunette } from '@lntt/wire'
import type {
  Express,
  Request as ExReq,
  RequestHandler,
  Response as ExRes,
} from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { DepGuard } from '../scope/adapter-guard.ts'
import { fragment, type Handler } from '../scope/fragment.ts'
import { runScope } from '../scope/run-fold.ts'
import type { InputOf } from '../scope/schema.ts'
import type { Outcome, RequestScope } from '../scope/scope.ts'
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
  return new Request(`http://localhost${req.originalUrl}`, { method: req.method, headers })
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

// Express types params as `Record<string, string>`, so we PARSE the path — the
// typed-params feature Express lacks. Express-5 positional `:name` only (no
// optional/regex/wildcard/repeated — YAGNI); values are always `string`.
type ParamNames<P extends string> = P extends `${string}:${infer After}`
  ? After extends `${infer Name}/${infer Rest}`
    ? Name | ParamNames<`/${Rest}`>
    : After
  : never
export type ExpressParams<P extends string> = { [K in ParamNames<P>]: string }

// The schema's REQUIRED input keys — the raw keys a route path must supply
// before coercion. Reconciliation is on KEY PRESENCE, not value types: a
// coercing schema (`z.coerce.number()`) reports its INPUT type as the coerced
// type, so a string route param would never match by value — only the key set
// is meaningful. Optional schema keys (`z.string().optional()`) are not required.
type RequiredKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K
}[keyof T]
export type RequiredInputKeys<S extends StandardSchemaV1> = RequiredKeys<InputOf<S>>

// The built app is attached to the express request by the mount middleware.
type WireReq = ExReq & { __wireApp?: unknown }

// Express pack. Takes the CHAIN, owns build-once, exposes the shared fragment
// surface, a `mount` middleware, a `route` registrar (typed + plain), and
// `dispose`. Node has no per-request env — the seed is static (captured at
// startup), so `seedFrom` takes no argument.
export function express<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: () => SeedOf<C>,
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = fragment()

  // mount = the middleware registered ONCE. Ensures the build and attaches the
  // app to the request; the seed is static.
  const mount = (): RequestHandler => async (req, _res, next) => {
    ;(req as WireReq).__wireApp = (await ensure(seedFrom())).app
    next()
  }

  const route = (app: Express) => {
    const run = async <S extends StandardSchemaV1, Need extends object, R>(
      handler: Handler<Need, S, R>,
      req: ExReq,
      res: ExRes,
    ): Promise<void> =>
      renderExpress(
        res,
        await runScope<RequestScope, S, R>(
          handler,
          (req as WireReq).__wireApp as object,
          { request: toWebRequest(req) },
          req.params,
        ),
      )

    // Typed routing reconciled on KEY PRESENCE: the parsed path keys
    // (`ExpressParams<Path>`) must be a superset of the schema's required input
    // keys — the path must supply everything the schema needs to coerce. Deps
    // by the DepGuard brand. `runScope` validates+coerces at runtime → a
    // RETURNED 422 abort on a bad param, which `renderExpress` renders as 4xx.
    const reg = {
      get<Path extends string, Need extends object, S extends StandardSchemaV1, R>(
        path: Path,
        handler: Handler<Need, S, R> &
          DepGuard<Pub, Need> &
          (ExpressParams<Path> extends Record<RequiredInputKeys<S>, unknown>
            ? unknown
            : { readonly __ERROR_route_missing_input_keys: RequiredInputKeys<S> }),
      ) {
        app.get(path, (req, res) => run(handler, req, res))
        return reg
      },
      post<Path extends string, Need extends object, S extends StandardSchemaV1, R>(
        path: Path,
        handler: Handler<Need, S, R> &
          DepGuard<Pub, Need> &
          (ExpressParams<Path> extends Record<RequiredInputKeys<S>, unknown>
            ? unknown
            : { readonly __ERROR_route_missing_input_keys: RequiredInputKeys<S> }),
      ) {
        app.post(path, (req, res) => run(handler, req, res))
        return reg
      },
      // Plain routing, no key reconciliation (design: "also allow plain
      // routing"); runtime validation still fires via `runScope`.
      getPlain<Need extends object, S extends StandardSchemaV1, R>(
        path: string,
        handler: Handler<Need, S, R> & DepGuard<Pub, Need>,
      ) {
        app.get(path, (req, res) => run(handler, req, res))
        return reg
      },
    }
    return reg
  }

  return { guard: base.guard, handle: base.handle, mount, route, dispose }
}
