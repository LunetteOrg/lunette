// Context keys may be Symbols: identity-based uniqueness (Effect-style
// tags) for whoever wants it, without wire knowing anything about it.
// The engine treats them like strings: guards, expose, mount.
// Not the recommended convention (strings + destructuring remain the
// main road), but supported.

import { describe, expect, it } from 'vitest'
import { lunette, type Lunette } from './index.ts'

const DB = Symbol('db')
const AUTH = Symbol('auth')

describe('Symbol keys', () => {
  it('flow through provide/expose and reach the app', async () => {
    const app = await lunette()
      .provide(() => ({ [DB]: { url: 'pg://sym' } }))
      .expose((ctx) => ({ [AUTH]: { where: () => ctx[DB].url } }))
      .run(async (pub) => pub)

    expect(app[AUTH].where()).toBe('pg://sym')
    // private: the DB symbol is not on the app
    expect(Object.getOwnPropertySymbols(app)).toEqual([AUTH])
  })

  it('the collision guard sees Symbols too', async () => {
    const chain = lunette()
      .provide(() => ({ [DB]: 1 }))
      .provide(() => ({ [DB]: 2 }) as never) as unknown as Lunette<object>

    await expect(chain.run(async () => {})).rejects.toThrow(
      /Keys already present in the context: Symbol\(db\)/,
    )
  })

  it('in mounts they shadow just like strings', async () => {
    const fragment = lunette()
      .provide(() => ({ [DB]: { url: 'pg://frag' } }))
      .expose((ctx) => ({ frag: { where: () => ctx[DB].url } }))

    const app = await lunette()
      .provide(() => ({ [DB]: { url: 'pg://host' } }))
      .expose(fragment)
      .expose((ctx) => ({ host: { where: () => ctx[DB].url } }))
      .run(async (pub) => pub)

    expect(app.frag.where()).toBe('pg://frag')
    expect(app.host.where()).toBe('pg://host')
  })
})
