import { describe, expect, it } from 'vitest'
import expressLib from 'express'
import request from 'supertest'
import { scope } from '@lntt/scope'
import { express, expressCarrier } from './carrier.ts'
import { requireActor } from './guards.ts'

describe('a scope-composed Express middleware', () => {
  const { mw } = express({})

  it('stops with a response, never reaching the route handler', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier).step(requireActor)))
    app.get('/', (_req, res) => res.json({ actor: res.locals.actor }))

    const res = await request(app).get('/')
    expect(res.status).toBe(401)
  })

  it('derives `actor` onto res.locals and calls next(), reaching the route handler', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier).step(requireActor)))
    app.get('/', (_req, res) => res.json({ actor: res.locals.actor }))

    const res = await request(app).get('/').set('x-actor-id', 'u1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ actor: 'u1' })
  })
})
