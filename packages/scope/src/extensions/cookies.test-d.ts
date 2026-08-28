import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../scope.ts'
import type { CookieSink } from './cookies.ts'
import { cookies } from './cookies.ts'

describe('cookies — the Set-Cookie sink + capability `cookies`', () => {
  it('exposes `ctx.cookies` and flows `cookies` into Cap', () => {
    const h = scope()
      .extend(cookies)
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'cookies') => 'cookies') | undefined>()
  })
})
