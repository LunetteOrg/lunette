import { describe, expect, it } from 'vitest'
import request from 'supertest'
import express from 'express'
import { app } from './server.ts'

describe('express: a domain "not found" said natively — by hand', () => {
  it('a known post: 200', async () => {
    const res = await request(app).get('/posts/1')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: '1' })
  })

  it('an unknown post: 404, hand-written — no framework helper for it', async () => {
    const res = await request(app).get('/posts/missing')
    expect(res.status).toBe(404)
  })
})

describe('express: auth (returned, not thrown) + redirect after a write', () => {
  it('no actor header: 401 via an early return', async () => {
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

describe('express: hand-rolled validation over express.json()', () => {
  it('a valid body: 201', async () => {
    const res = await request(app).post('/posts').send({ title: 'New', content: 'Body' })
    expect(res.status).toBe(201)
  })

  it('a well-formed but invalid body: 422', async () => {
    const res = await request(app).post('/posts').send({ title: '' })
    expect(res.status).toBe(422)
  })

  it('SILENT: malformed JSON reaches the SAME error middleware as every other error, and the 400 the framework computed is dropped for a blanket 422', async () => {
    const res = await request(app)
      .post('/posts')
      .set('content-type', 'application/json')
      .send('{not json')
    expect(res.status).toBe(422)
  })

  it("what express.json() actually computes for a malformed body, read directly off the error — the value the app's own catch-all above throws away", async () => {
    let captured: (Error & { status?: number; type?: string }) | undefined
    const probe = express()
    probe.use(express.json())
    probe.post('/probe', (_req, res) => res.end())
    probe.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      captured = err
      res.status(err.status ?? 500).end()
    })

    await request(probe).post('/probe').set('content-type', 'application/json').send('{not json')

    expect(captured).toBeInstanceOf(SyntaxError)
    expect(captured?.status).toBe(400)
    expect(captured?.type).toBe('entity.parse.failed')
  })
})
