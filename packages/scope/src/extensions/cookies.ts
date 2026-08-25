import type { Outcome } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue, Sink } from '../scope.ts'

// The `cookies` extension — a tree-shakable subpath (`@lntt/scope/cookies`).
// It owns EVERYTHING about cookies: the shape, the sink a scope writes, the
// effect that leaves with the `Outcome`, and the reader a host uses to get it
// back. The core knows none of it — the fold sees an opaque sink like any other
// (§34).
//
// Injecting it (`scope().extend(cookies)`) adds the `Set-Cookie` sink on
// `ctx.cookies` AND declares the `cookies` capability, so a cookie-setting scope
// is REJECTED at the mount site on a host that cannot render `Set-Cookie` (tRPC
// drops it). There is no per-call declaration — setting is a runtime
// `ctx.cookies.set(...)` — so `.extend(cookies)` IS the declaration: a scope
// that does not inject it has no `ctx.cookies` and no `effects.cookies`.
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

// What this extension deposits in `outcome.effects`.
export interface CookieEffect {
  readonly cookies: readonly SetCookie[]
}

export interface CookiesExtension extends ScopeExtension {
  readonly __ctx?: { readonly cookies: CookieSink }
  readonly __caps?: { readonly cookies: true }
  readonly __effects?: CookieEffect
}

const cookiesRuntime: ScopeExtensionValue = {
  methods() {
    return {}
  },
  sink: (): Sink => {
    const pending: SetCookie[] = []
    return {
      key: 'cookies',
      ctx: {
        set: (name: string, value: string, options: CookieOptions = {}) =>
          pending.push({ name, value, options }),
      } satisfies CookieSink,
      collect: () => pending as readonly SetCookie[],
    }
  },
}

export const cookies = cookiesRuntime as unknown as CookiesExtension

// The reader, exported next to the sink so the cast lives HERE and not in every
// host pack. A scope that never injected the extension simply collected none.
export const readCookies = (outcome: Outcome<unknown, object>): readonly SetCookie[] =>
  (outcome.effects as Partial<CookieEffect>).cookies ?? []
