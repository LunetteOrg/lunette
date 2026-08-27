import { buildOnce, type PubOf } from '@lntt/wire'
import { runScope } from '@lntt/scope'
import type { Capability, CarrierGuard, DepGuard, Handler, RequestCarrier } from '@lntt/scope'
import type { StandardSchemaV1 } from '@standard-schema/spec'
// The one primitive a pack COMPOSES for a host that RETURNS a Response, rather
// than writing onto one: the outcome codec. Its node counterpart is
// `renderOutcome`; no scope enters either.
import { outcomeToResponse } from '@lntt/integration/http'
import { aboutScope, chain, linkScope, listScope } from './chain.ts'
import { hostEnv } from './config/env.ts'

// The scope runtime with NO pack, on Cloudflare Workers. `examples/bare-express`
// makes the same point where the lazy build is merely ADVISABLE; here it is
// MANDATORY, so what follows is not a stylistic alternative to an adapter — it
// is the minimum a Worker needs, and an adapter is that same minimum with a name
// and a router.
//
// A Fetch host is also the shortest possible version of it: no request lift (the
// runtime hands over a `Request` already), no response writer (returning one is
// the contract). What is left is exactly the part worth reading — and the chain
// and scopes below are the ones `../hono` serves through its pack, so the two
// can be read side by side.

// ── 1. build once, lazily — not a preference here ────────────────────────────
// The handle at module scope, the BUILD inside the handler. Workers forbid
// asynchronous I/O outside a request and the store layer reads KV, so an eager
// build stops the worker from starting at all (§36 — and
// `test/module-scope.node.test.ts` runs that experiment against a fixture).
const { ensure } = buildOnce(chain)

type App = PubOf<typeof chain>

// ── 2. the mount: the two brands, named by hand ──────────────────────────────
// `DepGuard` and `CarrierGuard` ship from @lntt/scope, not from the adapters, so
// a host we ship nothing for keeps its compile-time gates by naming them in ONE
// signature (§34). This carrier provides `cookies` and `headers` — the codec
// renders both — but not `body`: nothing here reads the request body, so a
// body-reading scope is refused at the line that mounts it.
type HostCaps = 'cookies' | 'headers'

export const handler =
  <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
    h: Handler<Need, S, R, Cap> & DepGuard<App, Need> & CarrierGuard<Cap, HostCaps>,
  ) =>
  async (request: Request, params: Record<string, string>): Promise<Response> =>
    outcomeToResponse(
      await runScope<RequestCarrier, S, R>(
        h,
        (await ensure(() => ({ env: hostEnv() }))).app,
        { request },
        params,
      ),
    )

// ── 3. routing, which is the part a framework would own ──────────────────────
// Hand-rolled because there is no framework here to own it — and this is what an
// adapter buys you, the only thing it buys you. `../hono/src/server.ts` writes
// the same table as `.get(path, ...handler(scope))` and Hono matches the path;
// everything above this section is identical work either way.
const list = handler(listScope)
const link = handler(linkScope)
const about = handler(aboutScope)

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/links') return list(request, {})
    if (pathname === '/about') return about(request, {})
    const slug = /^\/links\/([^/]+)$/.exec(pathname)?.[1]
    if (slug !== undefined) return link(request, { slug })
    return new Response(null, { status: 404 })
  },
}

// What is NOT here, and is the honest cost of doing without a pack: the write
// path. `createScope` declares a `.body` channel, so it carries the `body`
// capability and `CarrierGuard` refuses it against `HostCaps` above — mounting
// it is a compile error, correctly, until this carrier learns to read a body.
// `src/server.test-d.ts` pins that, and it is the gate working with nothing
// from @lntt/integration in the picture beyond the outcome codec. It is also
// why `createScope` is NOT imported here: an unmountable scope in this module
// would ride into the bundle for nothing.
