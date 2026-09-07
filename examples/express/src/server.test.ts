import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from './server.ts'

describe('express + scope: the request-id middleware', () => {
  it('sets x-request-id on every response', async () => {
    const res = await request(app).get('/posts/1')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('different requests get different ids', async () => {
    const a = await request(app).get('/posts/1')
    const b = await request(app).get('/posts/1')
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id'])
  })
})

describe('express + scope: a domain "not found"', () => {
  it('a known post: 200', async () => {
    const res = await request(app).get('/posts/1')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: '1' })
  })

  it('an unknown post: 404', async () => {
    const res = await request(app).get('/posts/missing')
    expect(res.status).toBe(404)
  })
})

describe('express + scope: the SHARED guard, `.step(headers).guard(...)` on this host', () => {
  it('no actor header: 401, from the guard', async () => {
    const res = await request(app).post('/posts/1/publish')
    expect(res.status).toBe(401)
  })

  it('unknown post, authed: 404', async () => {
    const res = await request(app).post('/posts/missing/publish').set('x-actor-id', 'u1')
    expect(res.status).toBe(404)
  })

  it('known post, authed: redirects to the post', async () => {
    const res = await request(app).post('/posts/1/publish').set('x-actor-id', 'u1').redirects(0)
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/posts/1')
  })
})

describe('express + scope: the SHARED body reader and validator', () => {
  it('a valid body: 201', async () => {
    const res = await request(app).post('/posts').send({ title: 'New', content: 'Body' })
    expect(res.status).toBe(201)
  })

  it('a well-formed but invalid body: 422, from `.validate`', async () => {
    const res = await request(app).post('/posts').send({ title: '' })
    expect(res.status).toBe(422)
  })

  // Decision 48: with NO `express.json()` mounted, `body('json', onError)`
  // reads the stream itself and is the ONE error path for whatever is wrong
  // with it — malformed JSON included. There is no second answer from a
  // body parser to compare against any more.
  it('malformed JSON: 422 from `body()`’s own reader, not a body-parser 400', async () => {
    const res = await request(app)
      .post('/posts')
      .set('content-type', 'application/json')
      .send('{not json')
    expect(res.status).toBe(422)
  })

  // Decision 49: the reader has a default ceiling now — 100 kB isn't
  // reachable by hand here, but the shape is: an oversized body reaches
  // `onError` too, the same 422 a malformed one does, never a hang or a
  // crash.
  it('an oversized body: 422 from the same reader, not a raw connection drop', async () => {
    const res = await request(app)
      .post('/posts')
      .send({ title: 'x'.repeat(200_000), content: 'Body' })
    expect(res.status).toBe(422)
  })
})
