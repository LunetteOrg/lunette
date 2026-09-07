import { describe, expect, expectTypeOf, it } from 'vitest'
import { hc } from 'hono/client'
import type { Post } from '@lntt/example-app'
import { app, type AppType } from './server.ts'

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

  it('an unknown post, well-formed id: 404, from the domain lookup', async () => {
    expect((await app.request('/posts/999')).status).toBe(404)
  })
})

describe('hono + scope: `withId` — one base scope, two routes', () => {
  it('a malformed id never reaches the domain lookup: 400, from `.validate`', async () => {
    expect((await app.request('/posts/missing')).status).toBe(400)
  })

  // The same `withId` value serves both routes, and `route` checked BOTH
  // patterns against its schema — `route('/posts', getPost)` would not have
  // compiled (§53).
  it('the SAME base answers the same way under the other route', async () => {
    const res = await app.request('/posts/missing/publish', { method: 'POST' })
    expect(res.status).toBe(400)
  })
})

describe('hono + scope: the SHARED guard, `.step(headers).guard(...)` on this host', () => {
  it('no actor header: 401, from the guard', async () => {
    expect((await app.request('/posts/1/publish', { method: 'POST' })).status).toBe(401)
  })

  it('a malformed id: 400 from `withId`, before the actor guard even runs', async () => {
    const res = await app.request('/posts/missing/publish', {
      method: 'POST',
      headers: { 'x-actor-id': 'u1' },
    })
    expect(res.status).toBe(400)
  })

  it('unknown post, well-formed id, authed: 404', async () => {
    const res = await app.request('/posts/999/publish', {
      method: 'POST',
      headers: { 'x-actor-id': 'u1' },
    })
    expect(res.status).toBe(404)
  })

  it('known post, authed: redirects to the post', async () => {
    const res = await app.request('/posts/1/publish', {
      method: 'POST',
      headers: { 'x-actor-id': 'u1' },
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/posts/1')
  })
})

describe('hono + scope: the SHARED body reader and validator', () => {
  const post = (payload: unknown, contentType = 'application/json') =>
    app.request('/posts', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })

  it('a valid body: 201', async () => {
    expect((await post({ title: 'New', content: 'Body' })).status).toBe(201)
  })

  it('a well-formed but invalid body: 422, from `.validate`', async () => {
    expect((await post({ title: '' })).status).toBe(422)
  })

  it('malformed JSON: 422 from `body()`’s own reader', async () => {
    expect((await post('{not json')).status).toBe(422)
  })

  it('an oversized body: 422 from the same reader, not a hang', async () => {
    expect((await post({ title: 'x'.repeat(200_000), content: 'Body' })).status).toBe(422)
  })
})

// THE REASON THE MOUNT IS TRANSPARENT. `hc<typeof app>()` reads the route
// schema off the app's own type — and because the mounts hand back what the
// SCOPE handed back, every answer the scope can give reaches the client as a
// TYPE, not as `unknown`. A mount declared `Promise<Response>` would compile,
// serve the same bytes, and leave both assertions below reading `unknown`.
describe('hono + scope: the typed RPC client, end to end', () => {
  const client = hc<AppType>('http://localhost', { fetch: app.request })

  it('the client sees EVERY answer the scope can give, as a union', async () => {
    const res = await client.posts[':id'].$get({ param: { id: '1' } })
    const answered = await res.json()

    // the leaf's post, the 404 the domain lookup produces, and the 400 the
    // params schema produces — all three, none of them written down here
    expectTypeOf(answered).toEqualTypeOf<
      | Post
      | { readonly error: 'not found' }
      | {
          issues: readonly {
            readonly message: string
            readonly path?:
              | readonly (string | number | { readonly key: string | number | undefined } | null)[]
              | undefined
          }[]
        }
    >()

    expect(answered).toMatchObject({ id: '1', title: 'Hello' })
  })

  it('and the union is DISCRIMINATED, so the caller handles each answer', async () => {
    const res = await client.posts[':id'].$get({ param: { id: 'missing' } })
    const answered = await res.json()

    // no cast anywhere: the shapes differ, so `in` narrows them
    if ('issues' in answered) {
      expectTypeOf(answered.issues).toExtend<readonly { readonly message: string }[]>()
      expect(res.status).toBe(400)
    } else if ('error' in answered) {
      expect.unreachable('a malformed id never reaches the domain lookup')
    } else {
      expect.unreachable('a malformed id never reaches the leaf')
    }
  })
})
