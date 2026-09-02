// The HEADLESS request — a standard Fetch `Request` with the body accessors
// removed. Every carrier that holds a request exposes THIS, and the removal is
// what makes the body lock work: a step reaching for the body without going
// through a declared extension (#62) is a type error, not a silent empty read
// on a body-less host.
//
// It lives here rather than in the core, and rather than in `http.ts`. The core
// owns the mechanism and names no HTTP word — its first paragraph says so — and
// putting it in `http.ts` would make `trpc` import the HTTP carrier, which
// reads as tRPC extending HTTP when it does not. Internal, therefore, with no
// subpath of its own: one definition, re-exported by each carrier that holds
// one, so the three cannot drift.
//
// DERIVED from `Request` rather than hand-written, so it keeps the legitimate
// surface — url, method, headers, signal — in step with the platform instead of
// with a list somebody has to remember to update.

// The body-consuming members of the standard `Body` mixin, enumerated because
// this toolchain's `Request` comes from undici, which exposes no `Body` global
// to subtract. `clone` joins them: it hands back a FULL `Request`, so it is a
// body accessor under another name.
//
// Naming a member `Request` may not have is harmless — `Omit` ignores it — so
// the list may name more than it removes. It may not name LESS: a body member
// missing from it is reachable from `ctx.request`, which is the lock gone. What
// pins that is the negative in `http.test-d.ts`, one assertion per member.
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

export type RequestHead = Omit<Request, BodyMembers>
