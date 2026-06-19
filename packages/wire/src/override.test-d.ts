import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'

describe('override (types)', () => {
  it('may change the type of the replaced key, visibility preserved', async () => {
    const app = await lunette()
      .expose(() => ({ db: { url: 'pg://real' } }))
      .override(() => ({ db: { fake: true } }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ db: { fake: boolean } }>()
  })

  it('overriding a private key does not publish it', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'v1' }))
      .expose(() => ({ api: { v: 1 } }))
      .override(() => ({ secret: 'v2' }))
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ api: { v: number } }>()

    // @ts-expect-error — secret stays private even after the override
    app.secret
  })

  it('a typo in the key name blocks the chain', () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => ({ bd: 2 }))

    expectTypeOf(chain).toEqualTypeOf<{
      '⛔ overriding keys missing from the context': 'bd'
    }>()

    // @ts-expect-error — no continuing on the error type
    chain.run(async () => {})
  })
})
