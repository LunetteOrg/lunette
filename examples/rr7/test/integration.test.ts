import { describe, expect, it } from 'vitest'
import {
  commentsLoader,
  feedLoader,
  loginAction,
  meLoader,
  pack,
  postLoader,
  publishPostAction,
  verifyAction,
} from '../src/routes.ts'

// Integration test: the real example app mounted as React Router loaders/actions.
// `mount` builds the app once (in-memory PGlite) and yields the load context the
// loaders read back; each loader is invoked as RR7 would call it.
describe('example-app on React Router 7 — integration', () => {
  it('drives feed / post / login loaders against the real chain', async () => {
    const context = await pack.mount({})

    const feed = await feedLoader({ request: new Request('http://x/feed'), params: {}, context })
    expect(feed.status).toBe(200)
    expect(await feed.json()).toEqual({ feed: [] })

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

  it('drives the new comments loader / gated actions against the real chain', async () => {
    const context = await pack.mount({})

    const comments = await commentsLoader({
      request: new Request('http://x/posts/nope/comments'),
      params: { postId: 'nope' },
      context,
    })
    expect(comments.status).toBe(200)
    expect(await comments.json()).toEqual({ comments: [] })

    // the session gate on a loader and an action
    const me = await meLoader({ request: new Request('http://x/me'), params: {}, context })
    expect(me.status).toBe(401)

    const publish = await publishPostAction({
      request: new Request('http://x/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'x', body: 'y' }),
        headers: { 'content-type': 'application/json' },
      }),
      params: {},
      context,
    })
    expect(publish.status).toBe(401)

    // verify with no pending cookie → 401
    const verify = await verifyAction({
      request: new Request('http://x/verify', {
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
        headers: { 'content-type': 'application/json' },
      }),
      params: {},
      context,
    })
    expect(verify.status).toBe(401)
  })
})
