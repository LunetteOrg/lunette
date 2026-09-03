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

describe('express + scope: the SHARED guard, composed rather than hand-written', () => {
  it('no actor header: 401, from requireActor', async () => {
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

describe('express + scope: the SHARED validator', () => {
  it('a valid body: 201', async () => {
    const res = await request(app).post('/posts').send({ title: 'New', content: 'Body' })
    expect(res.status).toBe(201)
  })

  it('a well-formed but invalid body: 422, from `validated`', async () => {
    const res = await request(app).post('/posts').send({ title: '' })
    expect(res.status).toBe(422)
  })

  // No hand-rolled catch-all this time — nothing here answers a broken read
  // the same way it answers a bad payload, because there is no single catch
  // wrapping both any more. Malformed JSON never reaches `validated` at all:
  // express.json() rejects it before the scope runs, and Express's OWN
  // default error handler answers with the status body-parser computed.
  it('malformed JSON: answered by express.json() itself, not by the scope', async () => {
    const res = await request(app)
      .post('/posts')
      .set('content-type', 'application/json')
      .send('{not json')
    expect(res.status).toBe(400)
  })
})
