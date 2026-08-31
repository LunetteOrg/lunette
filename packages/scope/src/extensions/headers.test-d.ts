import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../scope.ts'
import { cookies } from './cookies.ts'
import { headers } from './headers.ts'
import type { CarrierGuard } from '../index.ts'
import type { HeaderSink } from './headers.ts'
import { http } from './http.ts'

// The type contract: `ctx.response.headers` exists ONLY where the extension was injected,
// and injecting it flows the `response-headers` capability, which the mount gates.
describe('the headers extension — the type contract', () => {
  it('puts a typed sink on ctx for guards that opt in', () => {
    scope(http)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        expectTypeOf(ctx.response.headers).toEqualTypeOf<HeaderSink>()
        return {}
      })
      .handle(() => ({}))
  })

  it('gives a scope WITHOUT the extension no `ctx.response.headers` at all', () => {
    scope()
      .guard((_deps: {}, ctx) => {
        // @ts-expect-error no headers extension: the sink is not on ctx
        ctx.response.headers.set('x', 'y')
        return {}
      })
      .handle(() => ({}))
  })

  it('gives a scope WITHOUT the extension no `.headers()` method', () => {
    // @ts-expect-error `.headers` arrives with the extension, not with the core
    scope().headers({ 'cache-control': 'no-store' })
  })

  it('flows the `response-headers` capability, so a host without it rejects the scope', () => {
    const decorated = scope(http).extend(headers).headers({ 'cache-control': 'no-store' }).handle(() => ({}))
    type Cap = typeof decorated extends { __cap?: (c: infer C) => void } ? C : never

    expectTypeOf<CarrierGuard<Cap, 'response-headers'>>().toEqualTypeOf<unknown>()
    expectTypeOf<CarrierGuard<Cap, 'set-cookie'>>().not.toEqualTypeOf<unknown>()
  })

  it('accumulates with the other extensions instead of replacing them', () => {
    const both = scope(http)
      .extend(cookies)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        ctx.response.cookies.set('sid', 'abc')
        ctx.response.headers.set('cache-control', 'no-store')
        return {}
      })
      .handle(() => ({}))
    type Cap = typeof both extends { __cap?: (c: infer C) => void } ? C : never

    // both capabilities travel, so only a host offering BOTH accepts it
    expectTypeOf<CarrierGuard<Cap, 'set-cookie' | 'response-headers'>>().toEqualTypeOf<unknown>()
    expectTypeOf<CarrierGuard<Cap, 'set-cookie'>>().not.toEqualTypeOf<unknown>()
  })
})
