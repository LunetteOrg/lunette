// The per-invocation shapes a guard/leaf reads. Two axes are host-variable:
// the CARRIER (what the host hands over — a `Request` for HTTP, a `Message`
// for the bus) and the mutable `cookies` output sink (fork 2). Typed `params`
// are NOT here: they flow as the dedicated second argument (typed `P`), so the
// carrier carries only the request/message plus the cookie sink.

export interface CookieOptions {
  readonly path?: string
  readonly httpOnly?: boolean
  readonly maxAge?: number
}

export interface SetCookie {
  readonly name: string
  readonly value: string
  readonly options: CookieOptions
}

export interface CookieSink {
  set(name: string, value: string, options?: CookieOptions): void
}

// The capabilities a host carrier can offer, and a fragment can REQUIRE. The
// only member today is `body` — consuming the request body stream. A fragment
// that reads the body (via `.body`/`.form`) requires it; a host whose carrier
// cannot supply a readable body (tRPC: one JSON `input`, no separate body)
// declares it absent, and the adapter's `CarrierGuard` turns the mismatch into
// a compile error at the wiring call site. Extensible: 'multipart', 'stream', …
export type Capability = 'body'

// The body-consuming members of a Fetch `Request` — the standard `Body` mixin,
// enumerated explicitly because this toolchain's `Request` comes from
// Node/undici, which does not expose `Body` as a global name. `clone` joins them
// because it returns a FULL `Request` (a body escape hatch). Removing a member
// `Request` may not have (e.g. `bytes`) is harmless — `Omit` ignores it.
type BodyMembers =
  | 'body'
  | 'bodyUsed'
  | 'arrayBuffer'
  | 'blob'
  | 'bytes'
  | 'formData'
  | 'json'
  | 'text'
  | 'clone'

// The HEADLESS request a fragment sees on `ctx.request`: a standard Fetch
// `Request` with the body accessors removed — DERIVED from `Request` (so it
// stays in sync and keeps the legitimate surface: url, method, headers, signal,
// …) rather than a hand-picked shape. This is the enforcement of design A — the
// body is UNREACHABLE from `ctx.request`, so it can ONLY be read through the
// declared `.body`/`.form` channels (which flow the `body` capability into the
// fragment's `Cap`). A guard reaching for the body without declaring it is a
// type error, not a silent empty read on a body-less host.
export type RequestHead = Omit<Request, BodyMembers>

// HTTP is the concrete, default carrier: `request` is the host's request as a
// headless view (`RequestHead`), `cookies` the output sink read back by the
// codec. The runtime object is a full Fetch `Request`; the type is narrowed so
// body reads must go through `.body`/`.form`.
export interface RequestScope {
  readonly request: RequestHead
  readonly cookies: CookieSink
}

// The message-bus carrier — a sibling of `RequestScope`, same sink. Groundwork
// for @lntt/listener (#10); the bus codec ignores `cookies`.
export interface Message {
  readonly body: unknown
  readonly kind?: string
}

export interface JobScope {
  readonly message: Message
  readonly cookies: CookieSink
}

// The host-agnostic result of running a scope: the leaf's value or the abort,
// plus the cookies the sink collected. A THROW is not represented here — it
// propagates past the handler as infrastructure.
export type Outcome<R> =
  | { readonly ok: true; readonly value: R; readonly cookies: readonly SetCookie[] }
  | { readonly ok: false; readonly abort: import('./abort.ts').Abort; readonly cookies: readonly SetCookie[] }
