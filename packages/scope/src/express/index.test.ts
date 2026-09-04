import { describe, expect, it } from 'vitest'
import expressLib from 'express'
import type { Request, Response } from 'express'
import request from 'supertest'
import { scope, type Next } from '../index.ts'
import { express, expressCarrier } from './index.ts'

// A guard, written here rather than imported: what a guard IS belongs to no
// carrier (§43), and the carrier's own claim is only that a step which stops
// is never followed by the ones after it.
const requireActor = async (
  _app: {},
  { req, res }: { readonly req: Request; readonly res: Response },
  next: Next<{ actor: string }>,
) => {
  const actor = req.header('x-actor-id')
  if (!actor) return res.status(401).json({ error: 'unauthorized' })
  return next({ actor })
}

describe('the Express carrier: what a run brings', () => {
  it('hands the step `req` and `res`, and the app the deps it was curried with', async () => {
    const { route } = express({ greeting: 'hello' })

    const app = expressLib()
    app.get(
      ...route('/greet/:name', (carrier) =>
        scope(carrier).step(
          // `req.params.name` is `string` off the PATTERN — no cast, and
          // `noUncheckedIndexedAccess` does not reach it, because the pattern
          // named the key.
          async ({ greeting }: { readonly greeting: string }, { req, res }) =>
            res.json({ said: `${greeting} ${req.params.name}` }),
        ),
      ),
    )

    const res = await request(app).get('/greet/ada')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ said: 'hello ada' })
  })

  it('curries the deps ONCE: every run of the mounted route reads the same app', async () => {
    const deps = { count: 0 }
    const { route } = express(deps)

    const app = expressLib()
    app.get(
      ...route('/', (carrier) =>
        scope(carrier).step(async (seen: { count: number }, { res }) => {
          seen.count += 1
          return res.json({ count: seen.count })
        }),
      ),
    )

    await request(app).get('/')
    const second = await request(app).get('/')
    expect(second.body).toEqual({ count: 2 })
  })
})

describe('the Express carrier: `mw`', () => {
  const { mw } = express({})

  it('derives onto res.locals and calls next(), reaching the route handler', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier).step(requireActor)))
    app.get('/', (_req, res) => res.json({ actor: res.locals.actor }))

    const res = await request(app).get('/').set('x-actor-id', 'u1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ actor: 'u1' })
  })

  it('a step that stops answers on `res`, and the route handler never runs', async () => {
    let reached = false
    const app = expressLib()
    app.use(mw(scope(expressCarrier).step(requireActor)))
    app.get('/', (_req, res) => {
      reached = true
      return res.json({})
    })

    const res = await request(app).get('/')
    expect(res.status).toBe(401)
    expect(reached).toBe(false)
  })

  it('puts only what the steps populated on res.locals — never the run\'s own args', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier).step(requireActor)))
    app.get('/', (_req, res) => res.json({ keys: Object.keys(res.locals) }))

    const res = await request(app).get('/').set('x-actor-id', 'u1')
    expect(res.body).toEqual({ keys: ['actor'] })
  })
})
