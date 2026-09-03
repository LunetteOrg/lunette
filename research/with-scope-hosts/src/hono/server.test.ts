import { describe, expect, it } from 'vitest'
import { app } from './server.ts'

describe('hono + scope: the request-id middleware', () => {
  it('sets x-request-id on every response', async () => {
    const res = await app.request('/posts/1')
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('different requests get different ids', async () => {
    const a = await app.request('/posts/1')
    const b = await app.request('/posts/1')
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'))
  })
})

describe('hono + scope: a domain "not found"', () => {
  it('a known post: 200', async () => {
    const res = await app.request('/posts/1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: '1' })
  })

  it('an unknown post: 404', async () => {
    const res = await app.request('/posts/missing')
    expect(res.status).toBe(404)
  })
})

describe('hono + scope: the SHARED guard, composed rather than hand-written', () => {
  it('no actor header: 401, from requireActor', async () => {
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

describe('hono + scope: the SHARED validator', () => {
  it('a valid body: 201', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New', content: 'Body' }),
    })
    expect(res.status).toBe(201)
  })

  it('a well-formed but invalid body: 422, from `validated`', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    })
    expect(res.status).toBe(422)
  })

  // Malformed JSON THROWS from `jsonBody` — a SyntaxError, distinct from
  // `validated`'s own controlled 422 — and the mount (`app.onError`) is what
  // translates that particular exception, not the scope.
  it('malformed JSON: answered by the mount\'s onError, not by the scope', async () => {
    const res = await app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(422)
  })
})
