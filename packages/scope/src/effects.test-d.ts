import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { scope, type Handler } from './scope.ts'
import { cookies, type SetCookie } from './extensions/cookies.ts'
import { headers } from './extensions/headers.ts'
import { runFold } from './run-fold.ts'
import type { CarrierGuard } from './adapter-guard.ts'
import type { Capability } from './carrier.ts'

// `Cap`/`Eff` stay type parameters of `run` ITSELF, inferred fresh at each
// call from the handler argument — supplying `HostCaps` as an explicit
// generic on `runFold` directly (a partial prefix of its 5 parameters) would
// fall back to `Eff`'s/`Cap`'s DEFAULTS instead of inferring them, the same
// trap `headers.test.ts`'s `run` helper works around. `HostCaps` is fixed
// wide enough (`'cookies' | 'headers'`) to admit every scope in this file.
const run = <R, Cap extends Capability = never, Eff extends object = {}>(
  handler: Pick<
    Handler<object, StandardSchemaV1, R, Cap, never, Eff>,
    'guards' | 'leaf' | 'prepare' | 'sinks' | '__eff' | '__cap'
  > &
    CarrierGuard<Cap, 'cookies' | 'headers'>,
) => runFold<object, R, 'cookies' | 'headers', Eff, Cap>(handler, {}, {}, {})

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

    const out = await run(s)
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
  })

  it('accumulates both extensions when both are injected', async () => {
    const s = scope()
      .extend(cookies)
      .extend(headers)
      .handle(() => ({ ok: true }))

    const out = await run(s)
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
  })

  it('gives a scope with NO extension an empty effect map', async () => {
    const s = scope().handle(() => ({ ok: true }))
    const out = await run(s)

    // @ts-expect-error this scope produces no cookies, so there is no such key
    out.effects.cookies
  })

  it('does not invent the key an extension was never injected for', async () => {
    const s = scope().extend(headers).handle(() => ({ ok: true }))
    const out = await run(s)

    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
    // @ts-expect-error the cookies extension was not injected
    out.effects.cookies
  })
})
