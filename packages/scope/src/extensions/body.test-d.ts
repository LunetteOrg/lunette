import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import { body } from './body.ts'

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
    // the adapter's CarrierGuard reads exactly this to gate a mount on a
    // body-less host (tRPC).
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'body') => 'body') | undefined>()
  })
})
