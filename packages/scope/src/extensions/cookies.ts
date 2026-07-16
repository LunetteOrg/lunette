import type { CookieSink } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue } from '../scope.ts'

// The `cookies` extension — a tree-shakable subpath (`@lntt/scope/cookies`).
// Injecting it (`scope().extend(cookies)`) adds the `Set-Cookie` output sink on
// `ctx.cookies` AND declares the `cookies` capability — so a cookie-setting scope
// is REJECTED at the mount site on a host that cannot render `Set-Cookie` (tRPC
// drops it). Unlike `body`, there is no per-call declaration (setting is a
// runtime `ctx.cookies.set(...)`), so `.extend(cookies)` IS the declaration: a
// scope that does not inject it has no `ctx.cookies`, and one that does can only
// mount where cookies render. `runFold` always creates the sink; the extension
// only governs its TYPE visibility + the gate. No fluent methods.
export interface CookiesExtension extends ScopeExtension {
  readonly __ctx?: { readonly cookies: CookieSink }
  readonly __caps?: { readonly cookies: true }
}

const cookiesRuntime: ScopeExtensionValue = {
  methods() {
    return {}
  },
}

export const cookies = cookiesRuntime as unknown as CookiesExtension
