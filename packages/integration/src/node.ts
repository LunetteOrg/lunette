import type { IncomingMessage } from 'node:http'

// The bridge from a Node request to the scope's carrier, shared by every
// non-Fetch host on Node (Express here; a Fastify/Koa pack would reuse it
// unchanged). The Fetch-based packs — Hono, React Router, tRPC — never need it:
// they already receive a `Request` with a real origin.
//
// `new Request(...)` demands an ABSOLUTE url while Node hands over a path, so
// an origin has to come from somewhere. That somewhere is the request itself,
// which means it is ATTACKER-CONTROLLED: `Host` is whatever the client typed.
// Hence `allowedHosts` — the one defence that works (an allowlist of expected
// hosts), offered rather than imposed, because trusting `Host` unfiltered is
// what Express, Fastify and Koa themselves do and this must not be the odd one
// out.

export interface NodeCarrierOptions {
  // The hosts this app answers to, INCLUDING the port when clients send one
  // (`app.example.com:8443`). A host outside the list is discarded for `origin`,
  // so a spoofed `Host` cannot travel into whatever the scope builds from
  // `ctx.request.url`. Unset = the host is taken as sent.
  readonly allowedHosts?: readonly string[]
  // Used when no host is available or the one sent is not allowed.
  readonly origin?: string
  // Read `X-Forwarded-Proto` / `X-Forwarded-Host`. ONLY behind a proxy that
  // rewrites them: they are client headers like any other, and a proxy that
  // merely appends leaves the client's value first in the list.
  readonly trustProxy?: boolean
}

const DEFAULT_ORIGIN = 'http://localhost'

const header = (req: IncomingMessage, name: string): string | undefined => {
  const raw = req.headers[name]
  return Array.isArray(raw) ? raw[0] : raw
}

// `X-Forwarded-*` are comma-separated hop lists — the first entry is the
// outermost hop, the one the client actually reached.
const firstHop = (value: string | undefined): string | undefined =>
  value?.split(',')[0]?.trim() || undefined

const scheme = (req: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwarded = firstHop(header(req, 'x-forwarded-proto'))
    if (forwarded === 'http' || forwarded === 'https') return forwarded
  }
  // `encrypted` is present on a TLSSocket and nothing else.
  return 'encrypted' in req.socket && req.socket.encrypted === true ? 'https' : 'http'
}

const originOf = (req: IncomingMessage, options: NodeCarrierOptions): string => {
  const fallback = options.origin ?? DEFAULT_ORIGIN
  const trustProxy = options.trustProxy === true
  const host = trustProxy
    ? (firstHop(header(req, 'x-forwarded-host')) ?? header(req, 'host'))
    : header(req, 'host')
  if (host === undefined) return fallback
  if (options.allowedHosts !== undefined && !options.allowedHosts.includes(host)) return fallback
  try {
    return new URL(`${scheme(req, trustProxy)}://${host}`).origin
  } catch {
    // A host that cannot form a URL is a malformed header, not a route.
    return fallback
  }
}

// Lift a Node request into the Web `Request` a `RequestCarrier` carries. The
// scope sees it narrowed to `RequestHead` (no body accessors), so the body stays
// reachable ONLY through the declared `.body`/`.form` channels (decision 34) —
// the runtime object being a full `Request` is what lets those channels read it.
export function toWebRequest(req: IncomingMessage, options: NodeCarrierOptions = {}): Request {
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
  const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/'
  return new Request(new URL(path, originOf(req, options)), init)
}
