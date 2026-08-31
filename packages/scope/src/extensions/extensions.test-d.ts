import { describe, expectTypeOf, it } from 'vitest'
import { standardSchema } from './standard-schema.ts'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { Channel } from '../scope.ts'
import type { CookieSink } from './cookies.ts'
import { body } from './body.ts'
import { cookies } from './cookies.ts'
import { headers } from './headers.ts'
import { http } from './http.ts'
import { rpc } from './trpc.ts'

// Cross-channel contracts (not owned by a single one): composing several, the
// §4 guard that rejects a redefined method, and the two categories staying
// disjoint.

describe('composition — several channels on one scope', () => {
  it('both ctx surfaces survive; Cap is their union', () => {
    const h = scope(http)
      .extend(body('json'))
      .extend(cookies)
      .extend(standardSchema)
      .validate('body', z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        expectTypeOf(ctx.response.cookies).toEqualTypeOf<CookieSink>()
        return {}
      })
    expectTypeOf(h.__cap).toEqualTypeOf<
      ((c: 'body' | 'set-cookie') => 'body' | 'set-cookie') | undefined
    >()
  })

  it('keeps the two write sinks side by side under ctx.response', () => {
    scope(http)
      .extend(cookies)
      .extend(headers)
      .guard((_deps: {}, ctx) => {
        // The `ctx.response` split is what makes this work: both channels
        // contribute under one parent instead of one overwriting the other.
        ctx.response.cookies.set('sid', 'abc')
        ctx.response.headers.set('cache-control', 'no-store')
        return {}
      })
      .handle(() => ({}))
  })
})

describe('collision guard (§4)', () => {
  it('a second channel that REDEFINES a method is rejected at the .extend call', () => {
    // a hostile channel declaring the SAME `headers` method name as
    // `@lntt/scope/headers`
    const evil = {} as Channel & {
      readonly __admission: { readonly query: true }
      // a REAL method, not a declared name: the gate reads what the type has
      headers(values: Readonly<Record<string, string>>): unknown
    }
    // @ts-expect-error — `evil` redefines `headers`, already contributed by `headers`
    scope(http).extend(headers).extend(evil)
  })
})

describe('carriers and channels are disjoint by declaration', () => {
  it('a carrier is not expressible where a channel goes', () => {
    // @ts-expect-error — a carrier carries no CHANNEL brand: a category error
    scope(http).extend(rpc)
  })

  it('a channel the carrier does not admit is refused where it is added', () => {
    // tRPC has no readable body, so the protocol admits neither encoding —
    // caught here, at the definition, not at some later mount.
    // @ts-expect-error — ⛔ this carrier has no json to speak of
    scope(rpc).extend(body('json'))
    // @ts-expect-error — ⛔ this carrier has no set-cookie to speak of
    scope(rpc).extend(cookies)
  })

  it('admits what tRPC really does have: the incoming reads', () => {
    scope(rpc).handle((_d: {}, ctx) => ({ url: ctx.request.url }))
  })
})
