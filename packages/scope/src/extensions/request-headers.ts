import type { Channel, ScopeExtensionValue, Step } from '../scope.ts'

// The `request-headers` channel — reading the headers that CAME IN
// (`@lntt/scope/request-headers`). Extending it populates `ctx.headers` as a
// plain lowercased record, so a guard reads `ctx.headers.authorization`
// without a schema and without reaching for `ctx.request`.
//
// A different channel from `@lntt/scope/headers`, which is the RESPONSE header
// sink living at `ctx.response.headers` — see `request-cookies.ts` for why the
// read side carries no capability while the write side does.
//
// A repeated header arrives already joined with `, `, because that is what the
// Fetch `Headers` iterator does; `set-cookie` is the documented exception and
// belongs to a request nobody reads here.
export interface RequestHeadersChannel extends Channel {
  readonly __admission: { readonly 'request-headers': true }
  readonly __validatable?: { readonly headers: Readonly<Record<string, string>> }
}

const step: Step = (_app, ctx, next) => {
  const request = (ctx as { request?: Request }).request
  return next({ headers: request === undefined ? {} : Object.fromEntries(request.headers) })
}

const runtime: ScopeExtensionValue = { step }

export const requestHeaders = runtime as unknown as RequestHeadersChannel
