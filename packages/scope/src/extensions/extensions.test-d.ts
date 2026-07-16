import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { ScopeExtension } from '../scope.ts'
import type { CookieSink, RequestHead } from '../carrier.ts'
import { request } from './request.ts'
import { body } from './body.ts'
import { cookies } from './cookies.ts'

// The carrier-capability extensions, tested next to the source they cover. Each
// maps to a boundary tRPC has: it reads headers (`request`, no capability) but
// has no readable body (`body`, capability `'body'`) and drops `Set-Cookie`
// (`cookies`, capability `'cookies'`). A scope only ever sees the channels it
// injected — the mistake a host cannot serve is impossible to WRITE, not merely
// caught late at the mount.

describe('request — read-only, no capability', () => {
  it('adds `ctx.request` but no body channels and no cookie sink', () => {
    scope()
      .extend(request)
      .guard((_app: {}, ctx) => {
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        // @ts-expect-error — the `body` channels are the `body` extension's
        ctx.body
        // @ts-expect-error — the cookie sink is the `cookies` extension's
        ctx.cookies
        return {}
      })
    // no `.body`/`.form` on a request scope → the tRPC-unsafe call cannot be written
    // @ts-expect-error — `.body` is not on `request`
    scope().extend(request).body(z.object({ x: z.string() }))
    // a request scope carries NO capability (Cap = never → mounts on tRPC)
    const h = scope().extend(request).handle((_d: {}) => ({ ok: true }))
    expectTypeOf(h.__cap).toEqualTypeOf<((c: never) => void) | undefined>()
  })
})

describe('body — the `.body`/`.form` channels + capability `body`', () => {
  it('exposes the validated body/form on ctx and flows `body` into Cap', () => {
    const h = scope()
      .extend(body)
      .body(z.object({ title: z.string() }))
      .form(z.object({ email: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        expectTypeOf(ctx.form).toEqualTypeOf<{ email: string }>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'body') => void) | undefined>()
  })
})

describe('cookies — the Set-Cookie sink + capability `cookies`', () => {
  it('exposes `ctx.cookies` and flows `cookies` into Cap', () => {
    const h = scope()
      .extend(cookies)
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'cookies') => void) | undefined>()
  })
})

describe('composition + collision guard (§4)', () => {
  it('multiple extensions compose; Cap is their union', () => {
    const h = scope()
      .extend(body)
      .extend(cookies)
      .body(z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        expectTypeOf(ctx.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'body' | 'cookies') => void) | undefined>()
  })

  it('a second extension that REDEFINES a method is rejected at the .extend call', () => {
    // a hostile extension declaring the SAME `body` method name as `@lntt/scope/body`
    const evil = {} as ScopeExtension & { readonly __methods?: { body: true } }
    // @ts-expect-error — `evil` redefines `body`, already contributed by `body`
    scope().extend(body).extend(evil)
  })
})
