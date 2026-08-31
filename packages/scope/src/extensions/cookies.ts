import type { Outcome } from '../carrier.ts'
import type { Channel, ScopeExtensionValue } from '../scope.ts'

// The `cookies` channel — WRITING `Set-Cookie` (`@lntt/scope/cookies`). It owns
// everything about that: the shape, the sink a scope writes, the effect that
// leaves with the `Outcome`, and the reader a host uses to get it back. The core
// knows none of it — the fold sees an opaque sink like any other (§34).
//
// It lands at `ctx.response.cookies`, because everything a scope WRITES lives
// under `ctx.response` while everything it READS sits at the top level. Before
// that split, this sink held `ctx.cookies` — the natural name for the incoming
// cookie the `request-cookies` channel now populates — and `ctx.cookies.set(…)`
// read as though it mutated the request.
//
// Extending it declares the `set-cookie` capability, so a cookie-setting scope
// is REJECTED at the mount on a host that cannot render it (tRPC drops it). The
// capability is named for the MACHINERY, not the subject: what a host either
// does or does not do is flush that header.
//
// There is no per-call declaration — setting is a runtime
// `ctx.response.cookies.set(...)` — so `.extend(cookies)` IS the declaration: a
// scope that does not add it has no sink and no `effects.cookies`.
export interface CookieOptions {
  readonly path?: string
  readonly httpOnly?: boolean
  readonly maxAge?: number
  // `Secure` and `SameSite` have no defaults here, and that is deliberate: the
  // sink is the ONLY way a scope writes a cookie, so a default would apply to
  // every cookie of every app. `secure: true` would break plain-`http` local
  // development silently, and browsers already default `SameSite` to Lax — a
  // default of ours would only add a second place to look. Explicit over
  // convenient (principle 7).
  readonly secure?: boolean
  readonly sameSite?: 'strict' | 'lax' | 'none'
}

export interface SetCookie {
  readonly name: string
  readonly value: string
  readonly options: CookieOptions
}

export interface CookieSink {
  set(name: string, value: string, options?: CookieOptions): void
}

// What this channel deposits in `outcome.effects`.
export interface CookieEffect {
  readonly cookies: readonly SetCookie[]
}

export interface CookiesChannel extends Channel {
  readonly __admission: { readonly 'set-cookie': true }
  readonly __ctx?: { readonly response: { readonly cookies: CookieSink } }
  readonly __caps?: { readonly 'set-cookie': true }
  readonly __effects?: CookieEffect
}

const runtime: ScopeExtensionValue = {
  // Its own step, and it WRAPS the rest of the fold — which is what makes the
  // collected cookies survive a short-circuit from deeper in: a guard that
  // drops the session cookie and then redirects still emits the `Set-Cookie`.
  // The `response` spread is what lets the other write channel sit beside this
  // one instead of replacing it.
  step: async (_app, ctx, next) => {
    const pending: SetCookie[] = []
    const sink: CookieSink = {
      set: (name, value, options = {}) => void pending.push({ name, value, options }),
    }
    const response = (ctx as { response?: object }).response
    const out = await next({ response: { ...response, cookies: sink } })
    return { ...out, effects: { ...out.effects, cookies: pending as readonly SetCookie[] } }
  },
}

export const cookies = runtime as unknown as CookiesChannel

// The reader, exported next to the sink so the cast lives HERE and not in every
// host pack. A scope that never added the channel simply collected none.
export const readCookies = (outcome: Outcome<unknown, object>): readonly SetCookie[] =>
  (outcome.effects as Partial<CookieEffect>).cookies ?? []
