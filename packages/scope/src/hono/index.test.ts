import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { scope, type Next } from '../index.ts'
import { z } from 'zod'
import { guards } from '../guard/index.ts'
import { hono, honoCarrier, params } from './index.ts'

// A guard, written here rather than imported: what a guard IS belongs to no
// carrier. It stops the way Hono stops — `throw new HTTPException(…)`.
const requireActor = async (
  _app: {},
  { c }: { readonly c: Context },
  next: Next<{ actor: string }>,
) => {
  const actor = c.req.header('x-actor-id')
  if (!actor) throw new HTTPException(401, { message: 'unauthorized' })
  return next({ actor })
}

describe('the Hono carrier: what a run brings', () => {
  it('hands the step `c`, and the app the deps it was curried with', async () => {
    const { handler } = hono({ greeting: 'hello' })

    // A SCOPE IS A VALUE — declared once, mounted wherever.
    const greet = scope(honoCarrier()).step(
      async ({ greeting }: { readonly greeting: string }, { c }) =>
        c.json({ said: `${greeting} ${c.req.param('name')}` }),
    )

    const app = new Hono()
    app.get('/greet/:name', handler(greet))

    const res = await app.request('/greet/ada')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ said: 'hello ada' })
  })

  it('hands back what the step returned: the route resolves to its Response', async () => {
    const { handler } = hono({})

    const app = new Hono()
    app.get('/', handler(scope(honoCarrier()).step(async (_app: {}, { c }) => c.text('made', 201))))

    const res = await app.request('/')
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('made')
  })
})

describe('the Hono carrier: `route(path, scope)`', () => {
  const { route } = hono({})

  const showPost = scope(honoCarrier()).step(async (_app: {}, { c }) =>
    c.json({ id: c.req.param('id') }),
  )

  it('hands back the pair Hono mounts, so the pattern is written once', async () => {
    const app = new Hono()
    app.get(...route('/posts/:id', showPost))

    expect(await (await app.request('/posts/7')).json()).toEqual({ id: '7' })
  })

  it('the same scope value mounts more than once, on more than one pattern', async () => {
    const app = new Hono()
    app.get(...route('/posts/:id', showPost))
    app.get(...route('/archive/:id', showPost))

    expect(await (await app.request('/archive/9')).json()).toEqual({ id: '9' })
  })
})

describe('the Hono carrier: `mw`', () => {
  const { mw } = hono({})

  it('derives onto the context via c.set and awaits next(), reaching the handler', async () => {
    const app = new Hono()
    app.use(mw(scope(honoCarrier()).step(requireActor)))
    app.get('/', (c) => c.json({ actor: c.get('actor' as never) }))

    const res = await app.request('/', { headers: { 'x-actor-id': 'u1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ actor: 'u1' })
  })

  it('a step that stops throws Hono\'s own HTTPException, and the handler never runs', async () => {
    let reached = false
    const app = new Hono()
    app.use(mw(scope(honoCarrier()).step(requireActor)))
    app.get('/', (c) => {
      reached = true
      return c.json({})
    })

    expect((await app.request('/')).status).toBe(401)
    expect(reached).toBe(false)
  })

  it('sets only what the steps populated — never the run\'s own args', async () => {
    const app = new Hono()
    app.use(mw(scope(honoCarrier()).step(requireActor)))
    app.get('/', (c) =>
      c.json({ c: c.get('c' as never) ?? null, next: c.get('next' as never) ?? null }),
    )

    const res = await app.request('/', { headers: { 'x-actor-id': 'u1' } })
    expect(await res.json()).toEqual({ c: null, next: null })
  })

  it('a middleware step may act AFTER next(): Hono awaits the fold', async () => {
    // The TWIN of `a step does NOT wrap the handler` in `express/index.test.ts`,
    // and the two assert opposite orders on purpose: Hono's `next` hands back a
    // promise and `toNext` awaits it, Express's hands back nothing. That is
    // where the portability of a step ends, and it is measured on both sides
    // rather than believed on either.
    const order: string[] = []

    const stamp = async (_app: {}, { c }: { readonly c: Context }, next: Next<{}>) => {
      order.push('before')
      const passed = await next({})
      order.push('after-next')
      // still in time to decorate the response, which is what wrapping means
      c.header('x-stamped', 'yes')
      return passed
    }

    const app = new Hono()
    app.use(mw(scope(honoCarrier()).step(stamp)))
    app.get('/', async (c) => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('handler')
      return c.text('body')
    })

    expect((await app.request('/')).headers.get('x-stamped')).toBe('yes')
    // on Express this is ['before', 'after-next', 'handler']
    expect(order).toEqual(['before', 'handler', 'after-next'])
  })
})

// ── a guard that stops by RETURNING a response, which is how `route`'s own
// steps answer. Hono reads a middleware's return: dropped, it sees `undefined`
// with the chain uncalled and answers 500.
describe('the Hono carrier: `mw` hands back a step\'s own response', () => {
  const { mw } = hono({})

  const requireActorReturning = async (
    _app: {},
    { c }: { readonly c: Context },
    next: Next<{ actor: string }>,
  ) => {
    const actor = c.req.header('x-actor-id')
    if (!actor) return c.json({ error: 'unauthorized' }, 401)
    return next({ actor })
  }

  const app = new Hono()
  app.use(mw(scope(honoCarrier()).step(requireActorReturning)))
  app.get('/', (c) => c.json({ actor: c.get('actor' as never) }))

  it('answers with what the step returned, and the handler never runs', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('still continues the chain when the step calls next', async () => {
    const res = await app.request('/', { headers: { 'x-actor-id': 'u1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ actor: 'u1' })
  })
})

describe('`params` on Hono: WIDE from `c.req.param()`, refined by `.validate`', () => {
  const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

  const showPost = scope(honoCarrier())
    .extend(guards)
    .step(params)
    .validate('params', IdParam, (issues, { c }) => c.json({ issues }, 400))
    .step(async (_a: {}, { params: p, c }) => c.json({ id: p.id }))

  it('a well-formed id passes through, VALIDATED — not merely read', async () => {
    const app = new Hono().get(...hono({}).route('/posts/:id', showPost))

    const res = await app.request('/posts/7')
    expect(await res.json()).toEqual({ id: '7' })
  })

  it('a malformed id never reaches the leaf: `.validate` answers 400', async () => {
    const app = new Hono().get(...hono({}).route('/posts/:id', showPost))

    const res = await app.request('/posts/not-a-number')
    expect(res.status).toBe(400)
  })

  // `route('/posts', showPost)` does not compile: the gate reads this scope's
  // schema and the pattern supplies no `id` (pinned in `index.test-d.ts`).
  // Past the gate, through the escape hatch, the same mistake reaches the
  // request — and `.validate` is what stands between it and the leaf.
  it('mounted past the gate with `handler`, a missing param is `.validate`\'s 400', async () => {
    const app = new Hono().get('/posts', hono({}).handler(showPost))

    const res = await app.request('/posts')
    expect(res.status).toBe(400)
  })

  it('reads what Hono\'s own router matched, on a nested pattern too', async () => {
    const app = new Hono().get(...hono({}).route('/tenants/:tenant/posts/:id', showPost))

    expect(await (await app.request('/tenants/acme/posts/9')).json()).toEqual({ id: '9' })
  })
})
