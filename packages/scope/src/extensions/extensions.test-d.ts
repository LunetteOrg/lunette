import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { ScopeExtension } from '../scope.ts'
import type { CookieSink } from './cookies.ts'
import { body } from './body.ts'
import { cookies } from './cookies.ts'

// Cross-extension contracts (not owned by a single extension): composing several,
// and the §4 guard that rejects a second extension redefining a method.

describe('composition — several extensions on one scope', () => {
  it('both method-sets survive; Cap is their union', () => {
    const h = scope()
      .extend(body)
      .extend(cookies)
      .body(z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        expectTypeOf(ctx.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'body' | 'cookies') => 'body' | 'cookies') | undefined>()
  })
})

describe('collision guard (§4)', () => {
  it('a second extension that REDEFINES a method is rejected at the .extend call', () => {
    // a hostile extension declaring the SAME `body` method name as `@lntt/scope/body`
    const evil = {} as ScopeExtension & { readonly __methods?: { body: true } }
    // @ts-expect-error — `evil` redefines `body`, already contributed by `body`
    scope().extend(body).extend(evil)
  })
})
