import type { Channel, ScopeExtensionValue, Step } from '../scope.ts'

// The `query` channel — a tree-shakable subpath (`@lntt/scope/query`).
// Extending it POPULATES `ctx.query` with what the URL actually carries, so a
// guard reads `ctx.query.page` with no schema at all; `validate('query', s)`
// refines the same key in place.
//
// It carries NO capability: a query string is a decoding of the URL every
// carrier holding a `RequestHead` already has, so nothing about a host either
// supports it or does not. What gates it is the carrier's `__admits` — an RPC
// contract puts nothing in the query string, so `trpc` does not admit this.
//
// Repeated keys collapse to an array rather than to the last value: dropping
// the earlier ones silently loses `?tag=a&tag=b`, which is ordinary in a
// filter UI. A schema that wants one value says so.
export interface QueryChannel extends Channel {
  readonly __admission: { readonly query: true }
  readonly __validatable?: { readonly query: Readonly<Record<string, string | string[]>> }
}

const readQuery = (request: Request): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {}
  for (const [key, value] of new URL(request.url).searchParams) {
    const seen = out[key]
    out[key] = seen === undefined ? value : Array.isArray(seen) ? [...seen, value] : [seen, value]
  }
  return out
}

const step: Step = (_app, ctx, next) => {
  const request = (ctx as { request?: Request }).request
  return next({ query: request === undefined ? {} : readQuery(request) })
}

const runtime: ScopeExtensionValue = { step }

export const query = runtime as unknown as QueryChannel
