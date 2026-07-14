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
    expect(await res.json()).toEqual({ feed: [] })
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

  it('POST /login with a valid email → 200 ok, sets a signed pending cookie', async () => {
    const form = new FormData()
    form.set('email', 'user@example.com')
    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    // the anti-replay pending state rides a signed cookie, not the body
    expect(res.headers.get('set-cookie')).toMatch(/^pending-auth=/)
  })

  it('GET /posts/:postId/comments → 200 with an empty list for an unknown post', async () => {
    const res = await app.request('/posts/nope/comments')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ comments: [] })
  })

  it('GET /me anonymous → 401 (the session gate)', async () => {
    expect((await app.request('/me')).status).toBe(401)
  })

  it('gated writes reject anonymous callers with 401', async () => {
    const json = (body: unknown): RequestInit => ({
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    expect((await app.request('/posts', json({ title: 'x', body: 'y' }))).status).toBe(401)
    expect((await app.request('/posts/p1/comments', json({ body: 'hi' }))).status).toBe(401)
    expect((await app.request('/me/preference', json({ surface: 'web' }))).status).toBe(401)
  })

  it('POST /verify without a pending cookie → 401', async () => {
    const res = await app.request('/verify', {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(401)
  })

  it('login → verify runs the real tx window: a returned domain error → 4xx, never a 5xx', async () => {
    const form = new FormData()
    form.set('email', 'window@example.com')
    const login = await app.request('/login', { method: 'POST', body: form })
    const setCookie = login.headers.get('set-cookie') ?? ''
    const pending = setCookie.split(';')[0] // `pending-auth=<signed>`
    expect(pending).toMatch(/^pending-auth=/)

    // The signed pending cookie round-trips (same secret) and verifyCode runs
    // inside its per-call transaction window. A brand-new email with no accepted
    // registration is RegistrationRequired — a RETURNED domain error the window
    // COMMITS and the codec maps to 422; an infra failure would THROW and land a
    // 5xx instead. Either way the window path is exercised end-to-end.
    const verify = await app.request('/verify', {
      method: 'POST',
      body: JSON.stringify({ code: '000000' }),
      headers: { 'content-type': 'application/json', cookie: pending },
    })
    expect(verify.status).toBe(422)
    expect(await verify.json()).toEqual({ error: 'RegistrationRequired' })
  })

  it('POST /logout → 302 redirect and clears the session cookie', async () => {
    const res = await app.request('/logout', { method: 'POST' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(res.headers.get('set-cookie')).toMatch(/^session=;/)
  })
})
