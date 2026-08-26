// The per-invocation shapes a guard/leaf reads, and the capability alphabet the
// mount gate speaks. Carrier fields (`request`, `cookies`) reach a scope only
// through the extensions that declare them (`@lntt/scope/request`, `.../cookies`);
// the agnostic `scope()` reads only `params` + guard enrichments. `RequestCarrier`
// / `JobCarrier` name the RUNTIME object a host hands to `runFold`.

// A capability NAME. The alphabet is OPEN — any extension may coin one, and the
// core enumerates none (principle 6): an extension declares what it requires in
// its own `__caps`, a mount declares what its carrier provides, and
// `CarrierGuard` is set inclusion between the two. `@lntt/scope`'s own
// extensions coin `body` (consuming the request body stream — `./body`'s
// `.body`/`.form`), `cookies` (writing `Set-Cookie` — `./cookies`) and `headers`
// (the response-header sink — `./headers`), but they are named THERE, not here.
//
// The two sides are deliberately asymmetric, and the asymmetry is what keeps
// every mistake falling the safe way (§34):
//
//   DEMAND (the scope) is OPEN — an unknown name is still carried, so a scope
//   requiring a capability no host has claimed mounts NOWHERE until one does.
//   SUPPLY (the mount) is CLOSED — a written-out set. Narrowing it only rejects
//   more; widening it is a claim about MACHINERY, so only whoever provides the
//   machinery may widen (a `body` scope works on Express because `toWebRequest`
//   streams the request into the Web Request — the label is the name of
//   something that exists, never a permission).
//
// This used to be `'body' | 'cookies' | 'headers'`, which filtered an
// extension's own names through a list the core kept: a third-party capability
// became `never`, `CarrierGuard<never, …>` collapsed to `unknown`, and the gate
// opened SILENTLY. `capability-alphabet.test-d.ts` is the negative that keeps it
// shut.
export type Capability = string

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
