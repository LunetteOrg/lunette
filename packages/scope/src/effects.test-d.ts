import { describe, expectTypeOf, it } from 'vitest'
import { scope } from './scope.ts'
import { cookies, type SetCookie } from './extensions/cookies.ts'
import { headers } from './extensions/headers.ts'
import { runFold } from './run-fold.ts'

// The point of carrying the effect map on `Handler`: `outcome.effects` has
// exactly the keys the scope's extensions can produce — no more, and no cast at
// the call site. This is what a hand-written host reads when it renders an
// outcome itself.
describe('the effect map travels with the scope', () => {
  it('types `effects` from the injected extensions', async () => {
    const s = scope()
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.cookies.set('sid', 'abc')
        return { ok: true }
      })

    const out = await runFold(s, {}, {}, {})
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
  })

  it('accumulates both extensions when both are injected', async () => {
    const s = scope()
      .extend(cookies)
      .extend(headers)
      .handle(() => ({ ok: true }))

    const out = await runFold(s, {}, {}, {})
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
  })

  it('gives a scope with NO extension an empty effect map', async () => {
    const s = scope().handle(() => ({ ok: true }))
    const out = await runFold(s, {}, {}, {})

    // @ts-expect-error this scope produces no cookies, so there is no such key
    out.effects.cookies
  })

  it('does not invent the key an extension was never injected for', async () => {
    const s = scope().extend(headers).handle(() => ({ ok: true }))
    const out = await runFold(s, {}, {}, {})

    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
    // @ts-expect-error the cookies extension was not injected
    out.effects.cookies
  })
})
