import { buildOnce, Lunette } from '@lntt/wire'
import type { PubOf, SeedOf } from '@lntt/wire'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  IntentGuard,
  InputOf,
  RequestCarrier,
} from '@lntt/scope'
import { scope, runScope } from '@lntt/scope'
import type { Outcome } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import type { HttpIntent } from '@lntt/scope/http'
import { data, redirect } from 'react-router'
import { readCookies } from '@lntt/scope/cookies'
import { readHeaders } from '@lntt/scope/headers'
import { serializeCookie } from './http.ts'

// The set of intents THIS host renders — written out by hand (§34). RR7's
// `render()` below reads `@lntt/scope/http`'s SAME vocabulary and translates
// it into RR7's own idiom (a redirect intent → RR7's `redirect()`, a status
// intent → a thrown `data()`) — there is no separate RR7 Abort/Ok vocabulary;
// `@lntt/scope/react-router` exists only for `ctx.request` and the escape
// hatch (a leaf that speaks `data()`/thrown `redirect()` directly, handled
// below and unrelated to this gate).
type HttpIntents = 'status' | 'redirect' | 'ok-status'
// RR7 loaders/actions get the Fetch request with a readable body, so RR7's
// carrier PROVIDES `body`/`cookies`/`headers`.
type ReactRouterCaps = 'body' | 'cookies' | 'headers'

// The load context `mount` produces, for the ONE deployment shape that has a
// place to register it. Loaders never read it: they reach the app through this
// pack, like every other host (§33). Valid only WITHOUT the `v8_middleware`
// future flag — with it, RR7's context is a `RouterContextProvider` read via
// `createContext`, not a plain record.
export type WireContext<Pub, K extends string = '__wireApp'> = Record<K, Pub>

export interface ReactRouterOptions {
  // The context key `mount` writes. Default `'__wireApp'`; give two packs in
  // one app different keys.
  readonly contextKey?: string
}

// The cookie sink as RR7 response headers. Absent when the sink stayed empty,
// so the common case returns the leaf's value untouched.
const responseHeaders = (outcome: Outcome<unknown, object>): Headers | undefined => {
  const written = readHeaders(outcome)
  const cookies = readCookies(outcome)
  if (cookies.length === 0 && [...written.keys()].length === 0) return undefined
  const headers = new Headers(written)
  for (const cookie of cookies) headers.append('Set-Cookie', serializeCookie(cookie))
  return headers
}

// `Outcome` in React Router's vocabulary. THROWS on a status intent: that is
// RR7's channel for "no page here", routed to the nearest `ErrorBoundary`, and
// it is what lets the success branch keep the leaf's type.
//
// A leaf MAY speak React Router itself — `return data(value, { status })`, or a
// `Response` it built. That is a deliberate escape hatch for an app that has
// chosen this host (it makes the scope unportable, so it does not belong in a
// shared scope catalogue), and it is SUPPORTED rather than accidental: what the
// leaf already built is never re-wrapped, the sinks' effects are merged INTO it.
// Wrapping it — which is what happens if you forget this case — silently drops
// the status the leaf asked for and serializes RR7's internal carrier as the
// body. The one thing the gate cannot see is a `Set-Cookie` the leaf writes
// inside its own Response: taking over the response means taking over its
// contract too (§34).
const merge = (into: ConstructorParameters<typeof Headers>[0], extra: Headers | undefined): Headers => {
  const merged = new Headers(into)
  if (extra) for (const [name, value] of extra) merged.append(name, value)
  return merged
}

const isData = <R>(value: unknown): value is { data: R; init?: ResponseInit } =>
  typeof value === 'object' && value !== null && 'data' in value && 'init' in value

function render<R>(outcome: Outcome<R, object>): R | ReturnType<typeof data<R>> | Response {
  const headers = responseHeaders(outcome)

  if (outcome.ok) {
    const value = outcome.value
    // The leaf handed back a Response of its own: keep it, add the effects.
    if (value instanceof Response) {
      if (!headers) return value
      return new Response(value.body, {
        status: value.status,
        statusText: value.statusText,
        headers: merge(value.headers, headers),
      })
    }
    // The leaf used `data(...)`: keep ITS init (the status it chose) and merge.
    if (isData<R>(value)) {
      const init = value.init ?? {}
      return data(value.data, { ...init, headers: merge(init.headers, headers) })
    }
    return headers ? data(value, { headers }) : value
  }

  // THREE branches, matching `Outcome`. The `invalid` case is not optional —
  // drop it and this function stops compiling. RR7 renders it the same way it
  // renders a `status` abort — a thrown `data()` — at 422, distinct from a
  // host-native validator's own 400.
  if ('invalid' in outcome) {
    throw data(
      { issues: outcome.invalid.issues },
      headers ? { status: 422, headers } : { status: 422 },
    )
  }

  const intent = outcome.abort.intent as HttpIntent
  if (intent.kind === 'redirect') {
    return redirect(intent.location, headers ? { status: intent.status, headers } : intent.status)
  }
  // The `ok` kind never rides an ABORT (only `Ok`'s own success side coins
  // it) — what remains is `status`.
  throw data(
    intent.kind === 'status' ? (intent.body ?? null) : null,
    headers ? { status: intent.status, headers } : { status: intent.status },
  )
}

// React Router 7 pack. Takes the CHAIN, owns build-once, and exposes the shared
// scope surface, the host `to*`, an OPTIONAL `mount`, and `dispose`. The core
// never imports react-router beyond its calling convention.
//
// The intended shape is a MODULE-LEVEL singleton: create the pack in a
// `.server` module reading `process.env` and export the loaders. That is not a
// stylistic preference — it is the only shape that works on every RR7
// deployment. `getLoadContext` belongs to the SERVER ADAPTERS
// (`@react-router/express`, `@react-router/node`), so it exists only once the
// user has written a custom server: under `react-router-serve` and
// `react-router dev` there is nowhere to register it (the dev server hardcodes
// `reactRouterDevLoadContext = () => void 0`), and the default template ships
// no server file at all. The framework's own Cloudflare template no longer
// routes bindings through the context either — it imports `env` from
// `cloudflare:workers` directly.
export function reactRouter<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: (hostEnv: unknown) => SeedOf<C>,
  options: ReactRouterOptions = {},
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const key = options.contextKey ?? '__wireApp'
  const base = scope().extend(request)

  // OPTIONAL, and only meaningful in a custom-server app: a `getLoadContext`
  // -shaped step that seeds the build from the host env and puts the app on the
  // load context. Loaders do NOT need it — register it to reach the app outside
  // a scope, or to seed eagerly at server boot instead of on the first request.
  const mount = async (hostEnv: unknown): Promise<WireContext<Pub>> =>
    ({ [key]: (await ensure(() => seedFrom(hostEnv))).app as Pub }) as WireContext<Pub>

  // The deps check (DepGuard) fires when the frag meets `toLoader`. Params are
  // NOT reconciled against the schema here: RR7's own typegen types
  // `args.params` from the file route (`Record<string, string>`), independent
  // of the scope's schema. `runScope` validates+coerces them at runtime →
  // a RETURNED 422 abort on a bad param, and the leaf reads the coerced
  // `OutputOf<S>`.
  // RR7 loaders/actions get the Fetch request with a readable body, so RR7
  // PROVIDES the `body` capability (`CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>`).
  //
  // The outcome is rendered in RR7's OWN vocabulary, not as an HTTP `Response`:
  // a loader feeds `loaderData`, so it must hand back DATA. The leaf's `R` flows
  // straight through (or wrapped in `data()` when the cookie sink has something
  // to send), which is what keeps `loaderData` typed as `R` instead of
  // `unknown`. A redirect intent becomes RR7's `redirect`; a status intent is
  // THROWN, which is how a loader says "this request does not have a page" and
  // hands over to the nearest `ErrorBoundary`.
  // FOUR gates now (`DepGuard`/`CarrierGuard` as before, plus `IntentGuard`).
  // NO route gate: RR7's pattern lives in its own route config, not at this
  // mount, so there is nothing here to check it against — `args.params` is
  // typed from the schema's INPUT (`InputOf<S>`, the raw pre-coercion shape
  // RR7 actually hands a loader) instead of `Record<string, string>`, so a
  // user writes `satisfies (args: Route.LoaderArgs) => unknown` and React
  // Router's OWN typegen does the checking — free, but the message is
  // TypeScript's structural wall rather than one of ours.
  const toLoader =
    <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability, Int extends PropertyKey>(
      handler: Handler<Need, S, R, Cap, Int> &
        DepGuard<Pub, Need> &
        CarrierGuard<Cap, ReactRouterCaps> &
        IntentGuard<Int, HttpIntents>,
    ) =>
    async (args: {
      request: Request
      params: InputOf<S>
      // Whatever RR7 hands over — `{}` under `react-router-serve`, a custom
      // server's load context, a `RouterContextProvider` with `v8_middleware`.
      // It is forwarded to `seedFrom` as the host env and NOT read for the app,
      // so a loader works with or without one.
      context?: unknown
    }): Promise<R | ReturnType<typeof data<R>> | Response> =>
      render<R>(
        await runScope<RequestCarrier, S, R, ReactRouterCaps, {}, Cap>(
          handler,
          (await ensure(() => seedFrom(args.context))).app as object,
          { request: args.request },
          args.params as object,
        ),
      )

  // Actions share the loader calling convention.
  const toAction = toLoader

  return { guard: base.guard, handle: base.handle, toLoader, toAction, mount, dispose }
}
