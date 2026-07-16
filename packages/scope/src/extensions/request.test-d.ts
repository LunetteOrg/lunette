import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { RequestHead } from '../carrier.ts'
import { request } from './request.ts'

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
  })

  it('has no `.body`/`.form` — the tRPC-unsafe call cannot be written', () => {
    // @ts-expect-error — `.body` is not on a request scope
    scope().extend(request).body(z.object({ x: z.string() }))
  })

  it('carries NO capability (Cap = never → mounts on tRPC)', () => {
    const h = scope().extend(request).handle((_d: {}) => ({ ok: true }))
    expectTypeOf(h.__cap).toEqualTypeOf<((c: never) => void) | undefined>()
  })
})
