// The per-invocation shapes a guard/leaf reads, and the capability alphabet the
// mount gate speaks. Carrier fields (`request`, `cookies`) reach a scope only
// through the extensions that declare them (`@lntt/scope/request`, `.../cookies`);
// the agnostic `scope()` reads only `params` + guard enrichments. `RequestCarrier`
// / `JobCarrier` name the RUNTIME object a host hands to `runFold`.

// The capabilities a host carrier can offer, and a scope can REQUIRE — each
// maps a carrier extension to the hosts that support it. `body` — consuming the
// request body stream (`@lntt/scope/body`'s `.body`/`.form`); a host with no
// readable body (tRPC) declares it absent. `cookies` — writing `Set-Cookie`
// (`@lntt/scope/cookies`); a host that cannot render it (tRPC drops it) declares
// it absent. The adapter's `CarrierGuard` turns a mismatch into a compile error
// at the wiring call site. Extensible: 'multipart', 'stream', …
export type Capability = 'body' | 'cookies' | 'headers'

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

// The HEADLESS request a `scope().extend(request)` guard/leaf sees on `ctx.request`: a
// standard Fetch `Request` with the body accessors removed — DERIVED from
// `Request` (so it stays in sync and keeps the legitimate surface: url, method,
// headers, signal, …) rather than a hand-picked shape. This is the enforcement
// of design A — the body is UNREACHABLE from `ctx.request`, so it can ONLY be
// read through the declared `.body`/`.form` channels (which flow the `body`
// capability into the scope's `Cap`). A guard reaching for the body without
// declaring it is a type error, not a silent empty read on a body-less host.
export type RequestHead = Omit<Request, BodyMembers>

// The HTTP carrier a host hands to `runFold`: the request as a headless view
// (`RequestHead`; the runtime object is a full Fetch `Request`, narrowed so body
// reads go through the `body` extension). The `Set-Cookie` sink is NOT part of the
// carrier — `runFold` creates it per invocation and the `cookies` extension gates
// its ctx visibility. All four HTTP-transport hosts hand over this carrier.
export interface RequestCarrier {
  readonly request: RequestHead
}

// The message-bus carrier — a sibling of `RequestCarrier`. Groundwork for
// @lntt/listener (#10).
export interface Message {
  readonly body: unknown
  readonly kind?: string
}

export interface JobCarrier {
  readonly message: Message
}

// The host-agnostic result of running a scope: the leaf's value or the abort,
// plus whatever the extensions' SINKS collected, keyed by extension. The core
// does not know what is in there — `cookies` and `headers` are the `cookies` and
// `headers` extensions' business, and each exports a typed reader for the hosts
// that care. A THROW is not represented here: it propagates past the handler as
// infrastructure.
export type Outcome<R, Eff extends object = {}> =
  | { readonly ok: true; readonly value: R; readonly effects: Eff }
  | { readonly ok: false; readonly abort: import('./abort.ts').Abort; readonly effects: Eff }
