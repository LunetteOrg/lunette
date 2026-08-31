import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import { body } from './body.ts'
import { http } from './http.ts'
import { standardSchema } from './standard-schema.ts'

describe('body — one ctx entry, either encoding, and the `body` capability', () => {
  it("body('json') populates ctx.body and validate refines it", () => {
    const h = scope(http)
      .extend(body('json'))
      .extend(standardSchema)
      .validate('body', z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        return {}
      })
    // the adapter's CarrierGuard reads exactly this to gate a mount on a
    // body-less host (tRPC).
    expectTypeOf(h.__cap).toEqualTypeOf<((c: 'body') => 'body') | undefined>()
  })

  it("body('form') lands on the SAME key, so a shared leaf needs no adaptation", () => {
    scope(http)
      .extend(body('form'))
      .extend(standardSchema)
      .validate('body', z.object({ email: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ email: string }>()
        return {}
      })
  })

  it('leaves the raw encoding on ctx for a scope that never validated', () => {
    scope(http)
      .extend(body('form'))
      .handle((_d: {}, ctx) => {
        // extensions POPULATE; `validate` only refines. A form is a record of
        // fields whether or not a schema ever ran.
        expectTypeOf(ctx.body).toEqualTypeOf<Readonly<Record<string, string | File>>>()
        return {}
      })
    scope(http)
      .extend(body('json'))
      .handle((_d: {}, ctx) => {
        // JSON has no shape until a schema gives it one.
        expectTypeOf(ctx.body).toEqualTypeOf<unknown>()
        return {}
      })
  })

  it('has no `body` entry to validate at all without the channel', () => {
    // @ts-expect-error — `body` is not among this scope's entries
    scope(http).extend(standardSchema).validate('body', z.object({ title: z.string() }))
  })
})
