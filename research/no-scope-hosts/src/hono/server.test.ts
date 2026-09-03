import { describe, expect, it } from 'vitest'
import { app } from './server.ts'

describe('hono: a domain "not found" said natively', () => {
  it('a known post: 200, the post as JSON', async () => {
    const res = await app.request('/posts/1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: '1' })
  })

  it('an unknown post: 404, via c.notFound() — RETURN, not a throw', async () => {
    const res = await app.request('/posts/missing')
    expect(res.status).toBe(404)
  })
})

describe('hono: auth (throw) + redirect after a write', () => {
  it('no actor header: 401', async () => {
    const res = await app.request('/posts/1/publish', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('unknown post, authed: 404', async () => {
    const res = await app.request('/posts/missing/publish', {
      method: 'POST',
      headers: { 'x-actor-id': 'u1' },
    })
    expect(res.status).toBe(404)
  })

  it('known post, authed: redirects to the post', async () => {
    const res = await app.request('/posts/1/publish', {
      method: 'POST',
      headers: { 'x-actor-id': 'u1' },
      redirect: 'manual',
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/posts/1')
  })
})

describe('hono: hand-rolled validation on the way in', () => {
  it('a valid body: 201, the created post', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New', content: 'Body' }),
    })
    expect(res.status).toBe(201)
  })

  it('a well-formed but invalid body: 422, with the issues', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    })
    expect(res.status).toBe(422)
  })

  it('malformed JSON — a genuine client mistake: 422', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(422)
  })

  // trap 18 (docs/design/scope-api.md): a body that fails to arrive (a reset
  // socket) is infrastructure, not a client mistake — `.json()` is made to
  // reject with something that is NOT a SyntaxError, and the single `catch`
  // cannot tell the two apart.
  it('SILENT: a body that fails to arrive is answered exactly like a malformed one', async () => {
    const req = new Request('http://localhost/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    req.json = () => Promise.reject(new Error('socket reset by peer'))

    const res = await app.request(req)

    expect(res.status).toBe(422)
  })
})
