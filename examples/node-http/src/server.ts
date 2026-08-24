import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { runScope } from '@lntt/scope'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  Outcome,
  RequestCarrier,
  SetCookie,
} from '@lntt/scope'
import {
  chain,
  commentScope,
  commentsScope,
  feedScope,
  identityScope,
  loginScope,
  logoutScope,
  parseEnv,
  postScope,
  publishPostScope,
  setPreferenceScope,
  verifyScope,
} from '@lntt/example-app'
import type { App, Env } from '@lntt/example-app'

// Mount @lntt/example-app on BARE node:http — no framework, and deliberately
// NOTHING from @lntt/integration: the four host packs are a convenience, not a
// requirement of the guest posture (decision 33). `.extend` leaves a scope a
// pure host-agnostic `Handler` (schema + prepare steps + guards + leaf), so a
// host only has to supply four things, each a section below: build the chain
// once, assemble the carrier from its native request, call `runScope`, and
// render the returned `Outcome`. Everything the shipped adapters add on top of
// that is routing sugar for their host.
//
// The route table below mounts the SAME scopes the adapter-backed examples
// mount, unchanged — including the ones that need carrier capabilities
// (`publishPostScope`/`commentScope` read the body, `loginScope`/`logoutScope`
// write cookies), so the capability model stays visible when wired by hand.

// ── 1. build once ────────────────────────────────────────────────────────────
// First-seed-wins promise memo: one app per process, built lazily on the first
// request. Correct because the seed is process-static (env) — this is NOT a
// per-request cache, and a per-request-varying seed would break the model.
type Built = Awaited<ReturnType<typeof chain.build>>

const buildOnce = (seedFrom: () => { env: Env }) => {
  let built: Promise<Built> | undefined
  return {
    ensure: (): Promise<Built> => (built ??= chain.build(seedFrom())),
    dispose: async (): Promise<void> => {
      if (built) await (await built).dispose()
    },
  }
}

// ── 2. the carrier ───────────────────────────────────────────────────────────
// node:http is not Fetch-based, so the scope's `RequestCarrier` is assembled by
// hand: an `IncomingMessage` lifted into a Web `Request`. The scope sees it
// narrowed to `RequestHead` (no body accessors), so the body is reachable only
// through the declared `.body`/`.form` channels — the runtime object is still a
// full `Request`, which is what makes those channels able to read it.
const toWebRequest = (req: IncomingMessage): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const method = req.method ?? 'GET'
  const init: RequestInit & { duplex?: 'half' } = { method, headers }
  // GET/HEAD carry no body. For the rest the node stream IS the Web Request
  // body, so `.body`/`.form` read the real bytes; a stream body requires
  // `duplex: 'half'`.
  if (method !== 'GET' && method !== 'HEAD') {
    ;(init as { body?: unknown }).body = req
    init.duplex = 'half'
  }
  const host = req.headers.host ?? 'localhost'
  return new Request(new URL(req.url ?? '/', `http://${host}`), init)
}

// ── 3. rendering the outcome ─────────────────────────────────────────────────
// `Set-Cookie` serialization, rewritten locally on purpose: the shipped one
// lives in @lntt/integration and importing it would defeat the exercise. It is
// eight lines over the `SetCookie` shape the sink collects — a host that needs
// more attributes writes them here, next to its own response code.
const serializeCookie = ({ name, value, options }: SetCookie): string => {
  const parts = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

// The whole host-facing contract of a scope: `ok: true` is the leaf's value, a
// RETURNED abort is a domain outcome carrying its response intent, and the
// cookies the sink collected ride BOTH branches (a redirect that drops a session
// still has to emit its `Set-Cookie`). A THROW never reaches here — it stays
// infrastructure and node's own error path turns it into a 500.
const render = (res: ServerResponse, outcome: Outcome<unknown>): void => {
  const headers: Record<string, string | string[]> = {}
  if (outcome.cookies.length > 0) headers['set-cookie'] = outcome.cookies.map(serializeCookie)

  if (outcome.ok) {
    headers['content-type'] = 'application/json'
    res.writeHead(200, headers)
    res.end(JSON.stringify(outcome.value))
    return
  }

  const { intent } = outcome.abort
  if (intent.kind === 'redirect') {
    headers['location'] = intent.location
    res.writeHead(intent.status, headers)
    res.end()
    return
  }
  if (intent.body === undefined) {
    res.writeHead(intent.status, headers)
    res.end()
    return
  }
  headers['content-type'] = 'application/json'
  res.writeHead(intent.status, headers)
  res.end(JSON.stringify(intent.body))
}

// ── 4. routing and the mount ─────────────────────────────────────────────────
// With no framework the host also owns the router. This is plumbing every
// framework already gives you — `:name` segments matched positionally — kept
// deliberately small so the wiring below stays the subject.
export interface Route {
  readonly method: string
  readonly segments: readonly string[]
  // The runtime face of a scope: the phantom `Need`/`R`/`Cap` markers make
  // `Handler` invariant, so the table stores what `runScope` actually reads.
  readonly handler: Pick<Handler<object, StandardSchemaV1, unknown>, 'guards' | 'leaf' | 'schema' | 'prepare'>
}

const split = (path: string): string[] => path.split('/').filter((s) => s !== '')

const match = (route: Route, method: string, segments: readonly string[]) => {
  if (route.method !== method || route.segments.length !== segments.length) return undefined
  const params: Record<string, string> = {}
  for (const [i, pattern] of route.segments.entries()) {
    const actual = segments[i] ?? ''
    if (pattern.startsWith(':')) params[pattern.slice(1)] = decodeURIComponent(actual)
    else if (pattern !== actual) return undefined
  }
  return params
}

// The capabilities THIS carrier provides: node's request stream is readable, so
// `body`; the response renders `Set-Cookie`, so `cookies` (§34). A host that
// could not do one of them narrows this set and every scope requiring it stops
// compiling at its `route(...)` line — the gate is @lntt/scope's, not the
// adapters': `CarrierGuard`/`DepGuard` ship from the core precisely so a
// hand-wired host keeps them.
type HostCaps = 'body' | 'cookies'

// The mount. `DepGuard<App, Need>` fires if the chain's public surface does not
// cover what the scope's leaf/guards declare; `CarrierGuard<Cap, HostCaps>` if
// the scope needs a capability this carrier lacks — both compile errors at the
// `route(...)` line, naming the gap. Params are validated at RUNTIME by
// `runScope` (node has no native validator), a bad param being a RETURNED 422.
export const route = <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  method: string,
  path: string,
  handler: Handler<Need, S, R, Cap> & DepGuard<App, Need> & CarrierGuard<Cap, HostCaps>,
): Route => ({ method, segments: split(path), handler })

export function makeServer(env?: Env): Server {
  const { ensure, dispose } = buildOnce(() => ({ env: env ?? parseEnv({}) }))

  const routes: readonly Route[] = [
    // reads
    route('GET', '/feed', feedScope),
    route('GET', '/posts/:postId', postScope),
    route('GET', '/posts/:postId/comments', commentsScope),
    route('GET', '/me', identityScope),
    // auth — the node request stream IS the Web Request body, so the `.form`/
    // `.body` channels read the real bytes; nothing pre-parses it away.
    route('POST', '/login', loginScope),
    route('POST', '/verify', verifyScope),
    route('POST', '/logout', logoutScope),
    // writes (gated)
    route('POST', '/posts', publishPostScope),
    route('POST', '/posts/:postId/comments', commentScope),
    route('POST', '/me/preference', setPreferenceScope),
  ]

  return createServer((req, res) => {
    void (async () => {
      const segments = split(new URL(req.url ?? '/', 'http://localhost').pathname)
      for (const entry of routes) {
        const params = match(entry, req.method ?? 'GET', segments)
        if (params === undefined) continue
        // The per-request call: the built app, the carrier assembled from the
        // native request, and the raw params for the scope's own schema.
        const { app } = await ensure()
        render(
          res,
          await runScope<RequestCarrier, StandardSchemaV1, unknown>(
            entry.handler,
            app,
            { request: toWebRequest(req) },
            params,
          ),
        )
        return
      }
      res.writeHead(404).end()
    })().catch(() => {
      // A THROW is infrastructure (the error convention): no intent to render.
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
    // The chain's disposables (the db pool) close with the server: build-once
    // owns a lifecycle, so the host owns tearing it down.
    .on('close', () => void dispose())
}
