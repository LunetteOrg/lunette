import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../scope.ts'
import type { CookieSink } from './cookies.ts'
import { cookies } from './cookies.ts'
import { http } from './http.ts'

describe('cookies — the Set-Cookie sink + capability `cookies`', () => {
  it('exposes `ctx.response.cookies` and flows `cookies` into Cap', () => {
    const h = scope(http)
      .extend(cookies)
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.response.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'set-cookie') => 'set-cookie') | undefined>()
  })
})
