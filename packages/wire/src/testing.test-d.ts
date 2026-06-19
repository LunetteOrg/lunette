import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from './index.ts'
import { test } from './testing.ts'

const chain = lunette<{ env: { url: string } }>()
  .provide(({ env }) => ({ db: { q: (): string => env.url } }))
  .expose(({ db }) => ({ probe: { go: (): string => db.q() } }))

describe('test(chain) — types', () => {
  it('substitutions are constrained to the Ctx keys and types', () => {
    // @ts-expect-error — 'bd' is not a context key (typo)
    test(chain).run({ env: { url: 'x' }, bd: {} }, async () => {})

    // @ts-expect-error — incompatible type for db
    test(chain).run({ env: { url: 'x' }, db: { q: () => 42 } }, async () => {})

    // @ts-expect-error — the seed stays mandatory
    test(chain).run({ db: { q: () => 'f' } }, async () => {})
  })

  it('the scope receives the same public app as run', async () => {
    await test(chain).run({ env: { url: 'x' } }, async (app) => {
      expectTypeOf(app).toEqualTypeOf<{ probe: { go: () => string } }>()
    })
  })
})
