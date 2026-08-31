import type { Channel, ScopeExtensionValue, Step } from '../scope.ts'

// The `request-cookies` channel — reading the cookies that CAME IN
// (`@lntt/scope/request-cookies`). Extending it populates `ctx.cookies`;
// `validate('cookies', s)` refines it.
//
// It is a DIFFERENT channel from `@lntt/scope/cookies`, which is the
// `Set-Cookie` sink, and the split is not tidiness. Reading a cookie is
// decoding a request header, which every carrier holding a `RequestHead` can
// do — tRPC included. Writing one needs a host that flushes `Set-Cookie`,
// which tRPC never does. One channel carrying both would have gated a
// session-reading RPC scope off tRPC for a header it never wrote, so this one
// carries no capability at all.
export interface RequestCookiesChannel extends Channel {
  // Reading a cookie is decoding a REQUEST HEADER, so that is the feature it
  // asks for — the same one `request-headers` asks for, which is why tRPC
  // admits both by naming one thing.
  readonly __admission: { readonly 'request-headers': true }
  readonly __validatable?: { readonly cookies: Readonly<Record<string, string>> }
}

// Split on the FIRST `=` only: a cookie value may legally contain more, and
// splitting on all of them truncated any base64 or signed value ending in `=`.
const parseCookieHeader = (header: string | null): Record<string, string> => {
  const out: Record<string, string> = {}
  if (header === null) return out
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at < 1) continue
    const name = part.slice(0, at).trim()
    if (name !== '') out[name] = decodeURIComponent(part.slice(at + 1).trim())
  }
  return out
}

const step: Step = (_app, ctx, next) => {
  const request = (ctx as { request?: Request }).request
  return next({ cookies: parseCookieHeader(request?.headers.get('cookie') ?? null) })
}

const runtime: ScopeExtensionValue = { step }

export const requestCookies = runtime as unknown as RequestCookiesChannel
