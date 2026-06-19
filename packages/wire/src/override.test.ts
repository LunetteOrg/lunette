import { describe, expect, it } from 'vitest'
import { lunette, type Lunette } from './index.ts'

type Db = { url: string; fake: boolean }

describe('override', () => {
  it('intentionally replaces an existing key', async () => {
    const app = await lunette()
      .expose(() => ({ db: { url: 'pg://real', fake: false } as Db }))
      .override(() => ({ db: { url: 'memory://', fake: true } as Db }))
      .expose((ctx) => ({
        repo: { find: (id: string) => `${ctx.db.url}/${id}` },
      }))
      .run(async (pub) => pub)

    // downstream steps see the replaced version
    expect(app.db.fake).toBe(true)
    expect(app.repo.find('42')).toBe('memory:///42')
  })

  it('the overridden key keeps its visibility', async () => {
    const app = await lunette()
      .provide(() => ({ secret: 'v1' }))     // private
      .expose(() => ({ api: { v: 1 } }))     // public
      .override(() => ({ secret: 'v2' }))    // stays private
      .override(() => ({ api: { v: 2 } }))   // stays public
      .run(async (pub) => pub)

    expect(Object.keys(app)).toEqual(['api'])
    expect(app.api.v).toBe(2)
    expect('secret' in app).toBe(false)
  })

  it('at runtime rejects overriding nonexistent keys (typo)', async () => {
    const chain = lunette()
      .provide(() => ({ db: 1 }))
      .override(() => ({ bd: 2 }) as never) as unknown as Lunette<object>

    await expect(chain.run(async () => {})).rejects.toThrow(
      /Cannot override keys missing from the context: bd/,
    )
  })
})
