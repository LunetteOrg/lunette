import { describe, expect, it } from 'vitest'
import { feedLoader, loginAction, pack, postLoader } from '../src/routes.ts'

// Integration test: the real example app mounted as React Router loaders/actions.
// `mount` builds the app once (in-memory PGlite) and yields the load context the
// loaders read back; each loader is invoked as RR7 would call it.
describe('example-app on React Router 7 — integration', () => {
  it('drives feed / post / login loaders against the real chain', async () => {
    const context = await pack.mount({})

    const feed = await feedLoader({ request: new Request('http://x/feed'), params: {}, context })
    expect(feed.status).toBe(200)
    expect(await feed.json()).toEqual({ signedIn: false, feed: [] })

    const missing = await postLoader({
      request: new Request('http://x/posts/nope'),
      params: { postId: 'nope' },
      context,
    })
    expect(missing.status).toBe(404)

    const form = new FormData()
    form.set('email', 'user@example.com')
    const login = await loginAction({
      request: new Request('http://x/login', { method: 'POST', body: form }),
      params: {},
      context,
    })
    expect(login.status).toBe(200)
    expect(await login.json()).toEqual({ ok: true })
  })
})
