import { describe, expectTypeOf, it } from 'vitest'
import { scope } from './scope.ts'
import { cookies, type SetCookie } from './extensions/cookies.ts'
import { headers } from './extensions/headers.ts'
import { http } from './extensions/http.ts'

// `Cap`/`Eff` stay type parameters of `run` ITSELF, inferred fresh at each
// call from the handler argument — supplying `HostCaps` as an explicit
// generic on `runFold` directly (a partial prefix of its 5 parameters) would
// fall back to `Eff`'s/`Cap`'s DEFAULTS instead of inferring them, the same
// trap `headers.test.ts`'s `run` helper works around. `HostCaps` is fixed
// wide enough (`'set-cookie' | 'response-headers'`) to admit every scope in this file.
// Two seeds: an `http` scope wants the request and its params, a bare `scope()`
// wants nothing. `HostCaps` is named at each call, which is the host stating
// its machinery (§34) — and it is what a hand-written host does anyway.
const httpSeed = { request: new Request('http://x/'), params: {} }

// The point of carrying the effect map on `Handler`: `outcome.effects` has
// exactly the keys the scope's extensions can produce — no more, and no cast at
// the call site. This is what a hand-written host reads when it renders an
// outcome itself.
describe('the effect map travels with the scope', () => {
  it('types `effects` from the injected extensions', async () => {
    const s = scope(http)
      .extend(cookies)
      .handle((_deps: {}, ctx) => {
        ctx.response.cookies.set('sid', 'abc')
        return { ok: true }
      })

    const out = await s<{}, 'set-cookie'>({}, httpSeed)
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
  })

  it('accumulates both extensions when both are injected', async () => {
    const s = scope(http)
      .extend(cookies)
      .extend(headers)
      .handle(() => ({ ok: true }))

    // BOTH capabilities have to be claimed: naming only `set-cookie` here is a
    // compile error, which is the gate doing its job on a direct call.
    const out = await s<{}, 'set-cookie' | 'response-headers'>({}, httpSeed)
    expectTypeOf(out.effects.cookies).toEqualTypeOf<readonly SetCookie[]>()
    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
  })

  it('gives a scope with NO extension an empty effect map', async () => {
    const s = scope().handle(() => ({ ok: true }))
    // a bare scope seeds nothing, and claims no machinery
    const out = await s({}, {})

    // @ts-expect-error this scope produces no cookies, so there is no such key
    out.effects.cookies
  })

  it('does not invent the key an extension was never injected for', async () => {
    const s = scope(http).extend(headers).handle(() => ({ ok: true }))
    const out = await s<{}, 'response-headers'>({}, httpSeed)

    expectTypeOf(out.effects.headers).toEqualTypeOf<Headers>()
    // @ts-expect-error the cookies extension was not injected
    out.effects.cookies
  })
})
