// The compile-time collision guard: use/provide return an error type (no
// longer the builder) when the patch repeats a top-level key that is
// already present. The chain stops at the exact point of the collision
// and the error names the offending key.

import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'

describe('compile-time collision guard', () => {
  it('a collision blocks the chain and names the key', () => {
    const chain = lunette()
      .provide(() => ({ useCases: { auth: { login: (): string => 'ok' } } }))
      .provide(() => ({ useCases: { profile: { get: (): string => 'me' } } }))

    expectTypeOf(chain).toEqualTypeOf<{
      '⛔ keys already present in the context': 'useCases'
    }>()

    // @ts-expect-error — run does not exist on the error type: impossible to continue
    chain.run(async () => {})
  })

  it('with one key per area the chain flows normally', async () => {
    const app = await lunette()
      .provide(() => ({ provide: () => {} })) // verb names are NOT reserved
      .expose(() => ({ auth: { login: (): string => 'ok' } }))
      .expose(() => ({ profile: { get: (): string => 'me' } }))
      .run(async (pub) => pub)

    expectTypeOf(app.auth.login).toEqualTypeOf<() => string>()
    expectTypeOf(app.profile.get).toEqualTypeOf<() => string>()
  })

  it('also reports multiple collisions', () => {
    const chain = lunette()
      .provide(() => ({ db: 1, email: 2 }))
      .provide(() => ({ db: 3, email: 4, repos: 5 }))

    expectTypeOf(chain).toEqualTypeOf<{
      '⛔ keys already present in the context': 'db' | 'email'
    }>()
  })
})
