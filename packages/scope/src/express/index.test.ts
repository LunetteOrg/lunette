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

    // A SCOPE IS A VALUE — declared once, mounted wherever.
    const greet = scope(expressCarrier<{ name: string }>()).step(
      async ({ greeting }: { readonly greeting: string }, { req, res }) =>
        res.json({ said: `${greeting} ${req.params.name}` }),
    )

    const app = expressLib()
    app.get('/greet/:name', route(greet))

    const res = await request(app).get('/greet/ada')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ said: 'hello ada' })
  })

  it('curries the deps ONCE: every run of the mounted route reads the same app', async () => {
    const deps = { count: 0 }
    const { route } = express(deps)

    const app = expressLib()
    app.get(
      '/',
      route(
        scope(expressCarrier()).step(async (seen: { count: number }, { res }) => {
          seen.count += 1
          return res.json({ count: seen.count })
        }),
      ),
    )

    await request(app).get('/')
    expect((await request(app).get('/')).body).toEqual({ count: 2 })
  })
})

describe('the Express carrier: `route(path, scope)`', () => {
  const { route } = express({})

  const showPost = scope(expressCarrier<{ id: string }>()).step(async (_app: {}, { req, res }) =>
    res.json({ id: req.params.id }),
  )

  it('hands back the pair Express mounts, so the pattern is written once', async () => {
    const app = expressLib()
    app.get(...route('/posts/:id', showPost))

    expect((await request(app).get('/posts/7')).body).toEqual({ id: '7' })
  })

  it('the same scope value mounts more than once, on more than one pattern', async () => {
    const app = expressLib()
    app.get(...route('/posts/:id', showPost))
    app.get(...route('/archive/:id', showPost))

    expect((await request(app).get('/archive/9')).body).toEqual({ id: '9' })
  })
})

describe('the Express carrier: `mw`', () => {
  const { mw } = express({})

  it('derives onto res.locals and calls next(), reaching the route handler', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier()).step(requireActor)))
    app.get('/', (_req, res) => res.json({ actor: res.locals.actor }))

    const res = await request(app).get('/').set('x-actor-id', 'u1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ actor: 'u1' })
  })

  it('a step that stops answers on `res`, and the route handler never runs', async () => {
    let reached = false
    const app = expressLib()
    app.use(mw(scope(expressCarrier()).step(requireActor)))
    app.get('/', (_req, res) => {
      reached = true
      return res.json({})
    })

    expect((await request(app).get('/')).status).toBe(401)
    expect(reached).toBe(false)
  })

  it('puts only what the steps populated on res.locals — never the run\'s own args', async () => {
    const app = expressLib()
    app.use(mw(scope(expressCarrier()).step(requireActor)))
    app.get('/', (_req, res) => res.json({ keys: Object.keys(res.locals) }))

    const res = await request(app).get('/').set('x-actor-id', 'u1')
    expect(res.body).toEqual({ keys: ['actor'] })
  })
})

// ── the thrown error is INFRASTRUCTURE (§3), and Express's own door for it is
// the error middleware. The fold's promise is a promise: dropped, the request
// hangs until the client gives up and the rejection surfaces as an unhandled
// one — which Node kills the process over by default.
describe('the Express carrier: a step that THROWS reaches the error middleware', () => {
  const { route, mw } = express({})

  const boom = scope(expressCarrier()).step(async () => {
    throw new Error('boom')
  })

  it('from a route', async () => {
    let caught: unknown
    const app = expressLib()
    app.get('/', route(boom))
    app.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
      caught = err
      res.status(500).json({ error: 'infrastructure' })
    })

    const res = await request(app).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'infrastructure' })
    expect((caught as Error).message).toBe('boom')
  })

  it('from a middleware, where the stalled chain would otherwise answer nothing at all', async () => {
    let reached = false
    const app = expressLib()
    app.use(mw(boom))
    app.get('/', (_req, res) => {
      reached = true
      return res.json({})
    })
    app.use((_err: unknown, _req: Request, res: Response, _next: () => void) =>
      res.status(500).json({ error: 'infrastructure' }),
    )

    expect((await request(app).get('/')).status).toBe(500)
    expect(reached).toBe(false)
  })
})

// ── the limit, measured rather than believed ────────────────────────────────
// Its twin lives in `hono/index.test.ts` — `a middleware step may act AFTER
// next(): Hono awaits the fold` — and the two assert OPPOSITE orders on purpose.
// That is where the portability of a step ends, and the comment on `toNext`
// says why: Express's `next` dispatches and hands back nothing to wait on.
describe('the Express carrier: a step does NOT wrap the handler', () => {
  it('runs its code after `next` BEFORE the downstream handler has finished', async () => {
    const order: string[] = []

    const around = async (_a: {}, _c: {}, next: Next<{}>) => {
      order.push('before')
      const passed = await next({})
      order.push('after-next')
      return passed
    }

    const app = expressLib()
    app.use(express({}).mw(scope().step(around)))
    app.get('/', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('handler')
      res.json({ ok: true })
    })

    await request(app).get('/')

    // On Hono and tRPC this is ['before', 'handler', 'after-next'].
    expect(order).toEqual(['before', 'after-next', 'handler'])
  })
})

// ── the other side of `.catch(next)` ────────────────────────────────────────
describe('the Express carrier: a throw AFTER `next` does not steal the handler\'s answer', () => {
  it('leaves the response to the handler that was already running', async () => {
    // `toNext` hands control on and returns at once, so the fold's promise is
    // still pending while the handler runs. A step throwing there rejects it —
    // and handed to `next` at that point it becomes a 500 for a request that
    // was about to answer 200. The latch confines `.catch(next)` to the window
    // before control was handed on.
    const throwsAfterNext = async (_a: {}, _c: {}, next: Next<{}>) => {
      await next({})
      throw new Error('late')
    }

    let errorHandlerRan = false
    const app = expressLib()
    app.use(express({}).mw(scope().step(throwsAfterNext)))
    app.get('/', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 10))
      res.json({ ok: true })
    })
    app.use((_err: unknown, _req: Request, res: Response, _next: () => void) => {
      errorHandlerRan = true
      res.status(500).json({ error: 'infrastructure' })
    })

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(errorHandlerRan).toBe(false)
  })

  it('still reaches the error middleware when the step throws BEFORE `next`', async () => {
    // The window where Express can act is unchanged: this is the case
    // `.catch(next)` exists for.
    const app = expressLib()
    app.use(
      express({}).mw(
        scope().step(async () => {
          throw new Error('early')
        }),
      ),
    )
    app.get('/', (_req, res) => res.json({ ok: true }))
    app.use((_err: unknown, _req: Request, res: Response, _next: () => void) =>
      res.status(500).json({ error: 'infrastructure' }),
    )

    expect((await request(app).get('/')).status).toBe(500)
  })
})
