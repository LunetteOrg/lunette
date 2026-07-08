import { describe, expect, it } from 'vitest'
import { app } from '../src/server.ts'

// Integration test: the REAL example app (its wire chain, in-memory PGlite via
// the default `memory://` DATABASE_URL) mounted on a REAL Hono app, driven
// through `app.request`. Complements the app's UNIT tests (handlers.test.ts,
// fragments with fake deps): here the fragments run against the actual built
// singletons, through the host's native routing and codec.
describe('example-app on Hono — integration', () => {
  it('GET /feed → 200, anonymous by default (no session cookie)', async () => {
    const res = await app.request('/feed')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedIn: false, feed: [] })
  })

  it('GET /posts/:postId → 404 for an unknown post (a returned domain abort)', async () => {
    const res = await app.request('/posts/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('POST /login with an invalid email → 422 (a returned domain abort)', async () => {
    const form = new FormData()
    form.set('email', 'not-an-email')
    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid-email' })
  })

  it('POST /login with a valid email → 200 ok', async () => {
    const form = new FormData()
    form.set('email', 'user@example.com')
    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
