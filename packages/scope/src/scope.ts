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

// HTTP is the concrete, default carrier: `request` is the host's Fetch request,
// `cookies` the output sink read back by the codec.
export interface RequestScope {
  readonly request: Request
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
