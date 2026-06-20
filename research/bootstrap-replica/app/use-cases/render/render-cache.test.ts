import { describe, expect, it } from 'vitest'
import {
  cacheKeyOf,
  type RenderCacheEntry,
  type RenderCacheRepository,
} from '../../domain/render.ts'
import type { Renderer } from '../../lib/renderer/index.ts'
import { renderModule } from '../../modules/render.ts'

// Seed-as-mock-boundary (decision 21): run the render fragment with a seed of
// fakes. The real db-backed render cache is NEVER created — the seed IS the
// mock. The seeded records decide every cache hit; misses fall through to the
// fake renderer, where the body/title double-bind is directly observable
// (format html vs text).

const seededCache = (seed: RenderCacheEntry[]): RenderCacheRepository => {
  const store = new Map(seed.map((e) => [cacheKeyOf(e), e.output]))
  return {
    async get(key) {
      return store.get(cacheKeyOf(key)) ?? null
    },
    async getMany(keys) {
      const out = new Map<string, string>()
      for (const key of keys) {
        const hit = store.get(cacheKeyOf(key))
        if (hit !== undefined) out.set(cacheKeyOf(key), hit)
      }
      return out
    },
    async upsert(entry) {
      store.set(cacheKeyOf(entry), entry.output)
    },
  }
}

const fakeRenderer: Renderer = {
  async render({ text, surface, format }) {
    return `R(${surface},${format}):${text}`
  },
  async detect() {
    return 'md'
  },
}

describe('render fragment via the seed boundary', () => {
  it('a seeded record is a cache hit; a miss renders through the provider', async () => {
    const renderCache = seededCache([
      { contentType: 'post-body', contentId: 'p1', surface: 'web', output: 'CACHED', source: 'upfront' },
    ])

    await renderModule.run({ renderCache, renderer: fakeRenderer }, async (app) => {
      // seeded → hit (the passed text is ignored)
      expect(await app.getRendered('post-body', 'p1', 'ignored', 'web')).toBe('CACHED')
      // miss → rendered by the provider on the BODY path (format html)
      expect(await app.getRendered('post-body', 'p2', 'fresh', 'web')).toBe('R(web,html):fresh')
    })
  })

  it('the double-bind selects format: body=html, title=text', async () => {
    await renderModule.run(
      { renderCache: seededCache([]), renderer: fakeRenderer },
      async (app) => {
        expect(await app.getRendered('post-body', 'x', 'Hi', 'feed')).toBe('R(feed,html):Hi')
        expect(await app.getRenderedTitle('post-title', 'x', 'Hi', 'feed')).toBe('R(feed,text):Hi')
      },
    )
  })

  it('getRenderedMany batches hits and misses', async () => {
    const renderCache = seededCache([
      { contentType: 'post-body', contentId: 'a', surface: 'feed', output: 'A-CACHED', source: 'lazy' },
    ])
    await renderModule.run({ renderCache, renderer: fakeRenderer }, async (app) => {
      const out = await app.getRenderedMany(
        'post-body',
        [
          { id: 'a', text: 'a-text' },
          { id: 'b', text: 'b-text' },
        ],
        'feed',
      )
      expect(out.get('a')).toBe('A-CACHED')
      expect(out.get('b')).toBe('R(feed,html):b-text')
    })
  })
})
