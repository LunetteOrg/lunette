import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Outcome } from '@lntt/scope'
import { readCookies } from '@lntt/scope/cookies'
import { readHeaders } from '@lntt/scope/headers'
import type { HttpIntent } from '@lntt/scope/http'
import { serializeCookie } from './http.ts'

// The two Node-side halves of a pack, public so a host we ship no pack for
// composes them instead of copying them: the request lift (below) and the
// outcome render (`renderOutcome`, at the bottom). Express uses both; a
// Fastify/Koa pack would reuse them unchanged. The Fetch-based packs — Hono,
// React Router, tRPC — need neither: they receive a `Request` with a real origin
// and hand back a `Response` (`outcomeToResponse` in `./http.ts`).
//
// `new Request(...)` demands an ABSOLUTE url while Node hands over a path, so
// an origin has to come from somewhere — and this lift DOES NOT GUESS IT. It
// takes the origin it is given, because deciding which `Host` to believe is a
// policy about proxies, and the host framework already owns that policy: on
// Express it is `app.set('trust proxy')`, which `req.protocol`/`req.host` then
// answer to. A second allowlist here would be that decision made twice, in two
// places, by whoever wrote the adapter rather than whoever runs the app (§40).
//
// So the origin is a REQUIRED argument, not an option with a default. A default
// would be the same guess wearing different clothes — `http://localhost` instead
// of `Host`, and wrong more often. Requiring it puts the decision where someone
// can make it: the pack takes it from Express (see `express.ts`), a hand-wired
// host writes the one its app answers to.

// Lift a Node request into the Web `Request` a `RequestCarrier` carries. The
// scope sees it narrowed to `RequestHead` (no body accessors), so the body stays
// reachable ONLY through the declared `.body`/`.form` channels (decision 34) —
// the runtime object being a full `Request` is what lets those channels read it.
export function toWebRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }

  const method = req.method ?? 'GET'
  const init: RequestInit & { duplex?: 'half' } = { method, headers }
  // GET/HEAD carry no body. For the rest the node stream IS the Web Request
  // body, so a leaf reads the real bytes through `.body`/`.form`; a stream body
  // requires `duplex: 'half'`.
  if (method !== 'GET' && method !== 'HEAD') {
    ;(init as { body?: unknown }).body = req
    init.duplex = 'half'
  }

  // `originalUrl` is Express's (it survives sub-router mounting, where `url` is
  // rewritten relative to the mount point); `url` is what bare Node gives. Read
  // in that order the lift serves both without depending on Express's types.
  // RE-ANCHORED on the origin, keeping only path and query. `new URL(target,
  // base)` DISCARDS the base whenever the target carries an origin of its own,
  // and a request target is client-controlled: absolute-form (`GET
  // http://elsewhere/p HTTP/1.1`, legal HTTP/1.1), authority-relative
  // (`//elsewhere/p`), and `/\elsewhere/p` (WHATWG reads `\` as `/` in an
  // authority) all replace it. Parsing then re-anchoring keeps the origin the
  // host established, whatever the target claims.
  //
  // Note the consequence: the URL a scope reads is NORMALISED, while the router
  // matched on the raw target. They can differ (`/a/../b` here is `/b`), so a
  // scope must not re-derive routing decisions from `ctx.request.url`.
  const target = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/'
  const parsed = new URL(target, origin)
  return new Request(new URL(`${parsed.pathname}${parsed.search}`, origin), init)
}

// The outcome render for a node `ServerResponse` — the counterpart of
// `outcomeToResponse` (`./http.ts`) for hosts that write onto a response object
// instead of returning one. Express's `Response` EXTENDS `ServerResponse`, as
// does Fastify's `res.raw`, so one function serves every node host including
// bare `node:http`.
//
// This is the whole host-facing contract of a scope: `ok: true` is the leaf's
// value, a RETURNED abort carries its `ResponseIntent`, and the cookies the sink
// collected ride BOTH branches (a redirect that drops a session still has to
// emit its `Set-Cookie`). A THROW never reaches here — it stays infrastructure
// and the host's own error path turns it into a 500.
export function renderOutcome(res: ServerResponse, outcome: Outcome<unknown, object>): void {
  const headers: Record<string, string | string[]> = {}
  // Each effect through its extension's reader; neither injected reads empty.
  for (const [name, value] of readHeaders(outcome)) headers[name] = value
  const cookies = readCookies(outcome)
  if (cookies.length > 0) {
    // APPEND, never assign. A `set-cookie` can arrive from the headers
    // extension as well as from the cookie sink, and more cookies means more
    // `Set-Cookie` headers — that is HTTP, not a preference. Assigning here
    // dropped whatever the other extension wrote, so the same scope answered
    // differently on a node host than on a Fetch one, where `outcomeToResponse`
    // appends.
    const existing = headers['set-cookie']
    headers['set-cookie'] = [
      ...(existing === undefined ? [] : Array.isArray(existing) ? existing : [existing]),
      ...cookies.map(serializeCookie),
    ]
  }

  if (outcome.ok) {
    // SERIALISE FIRST. `writeHead` commits the status line to the wire, so a
    // value that will not stringify (a bigint, a cycle) must fail while the
    // response can still become a 500 — otherwise the throw leaves the socket
    // destroyed and the client gets nothing at all. `outcomeToResponse` has the
    // same ordering, which is what keeps the two codecs telling one story.
    const body = JSON.stringify(outcome.value)
    headers['content-type'] = 'application/json'
    res.writeHead(200, headers)
    res.end(body)
    return
  }

  // THREE branches, matching `Outcome`. The `invalid` case is not optional —
  // drop it and this function stops compiling. 422, and not a host-native
  // 400, is the codec's choice, made HERE (same as `outcomeToResponse`).
  if ('invalid' in outcome) {
    const body = JSON.stringify({ issues: outcome.invalid.issues })
    headers['content-type'] = 'application/json'
    res.writeHead(422, headers)
    res.end(body)
    return
  }

  // Same cast `outcomeToResponse` makes: `intent` is opaque to the core, and
  // this codec IS the http vocabulary's host.
  const intent = outcome.abort.intent as HttpIntent
  if (intent.kind === 'redirect') {
    headers['location'] = intent.location
    res.writeHead(intent.status, headers)
    res.end()
    return
  }
  // The `ok` kind never rides an ABORT (only `Ok`'s own success side coins
  // it), so what remains here is `status` — `httpError`/`notFound`/….
  if (intent.kind === 'ok' || intent.body === undefined) {
    res.writeHead(intent.status, headers)
    res.end()
    return
  }
  const body = JSON.stringify(intent.body)
  headers['content-type'] = 'application/json'
  res.writeHead(intent.status, headers)
  res.end(body)
}
