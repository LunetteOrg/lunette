import { layer, lunette } from '@lntt/wire'
import { scope, unauthorized } from '@lntt/scope'
import { request } from '@lntt/scope/request'

// PRODUCT TWO: an admin area. A DIFFERENT composition root, with a different
// seed, different services and its own lifecycle — not a slice of the catalogue.
export interface AdminEnv {
  readonly TOKEN: string
}

export const opened: string[] = []
export const closed: string[] = []

const withAudit = layer<{ env: AdminEnv }, { entries: string[] }>(async (_ctx, next) => {
  opened.push('audit')
  const entries: string[] = []
  try {
    return await next({ entries })
  } finally {
    closed.push('audit')
  }
})

export const adminChain = lunette<{ env: AdminEnv }>()
  .use(withAudit)
  .expose('audit', (ctx) => ({
    record: (what: string) => ctx.entries.push(what),
    all: () => [...ctx.entries],
  }))
  // Exposed so a guard can check the token; the env itself stays out of reach.
  .expose('auth', (ctx) => ({ accepts: (token: string | null) => token === ctx.env.TOKEN }))

// The gate: an admin scope is useless without it, and it reads the request —
// so this product's scopes need the `request` extension while the catalogue's
// do not. Two chains, two different shapes of scope.
const gated = scope()
  .extend(request)
  .guard((deps: { auth: { accepts(t: string | null): boolean } }, ctx) =>
    deps.auth.accepts(ctx.request.headers.get('authorization')) ? {} : unauthorized(),
  )

export const auditScope = gated.handle((deps: { audit: { all(): string[] } }) => ({
  entries: deps.audit.all(),
}))

export const recordScope = gated.handle((deps: { audit: { record(w: string): void; all(): string[] } }) => {
  deps.audit.record('someone looked')
  return { recorded: deps.audit.all().length }
})
