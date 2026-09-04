import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { scope, type Next } from '../index.ts'
import { hono, honoCarrier } from './index.ts'

// A guard, written here rather than imported: what a guard IS belongs to no
// carrier (§43). It stops the way Hono stops — `throw new HTTPException(…)`.
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
    const { route } = hono({ greeting: 'hello' })

    // A SCOPE IS A VALUE, and it names the pattern it reads.
    const greet = scope(honoCarrier<'/greet/:name'>()).step(
      async ({ greeting }: { readonly greeting: string }, { c }) =>
        c.json({ said: `${greeting} ${c.req.param('name')}` }),
    )

    const app = new Hono()
    app.get('/greet/:name', route(greet))

    const res = await app.request('/greet/ada')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ said: 'hello ada' })
  })

  it('hands back what the step returned: the route resolves to its Response', async () => {
    const { route } = hono({})

    const app = new Hono()
    app.get('/', route(scope(honoCarrier()).step(async (_app: {}, { c }) => c.text('made', 201))))

    const res = await app.request('/')
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('made')
  })
})

describe('the Hono carrier: `route(path, scope)`', () => {
  const { route } = hono({})

  const showPost = scope(honoCarrier<'/posts/:id'>()).step(async (_app: {}, { c }) =>
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
    const stamp = async (_app: {}, { c }: { readonly c: Context }, next: Next<{}>) => {
      const passed = await next({})
      c.header('x-stamped', 'yes')
      return passed
    }

    const app = new Hono()
    app.use(mw(scope(honoCarrier()).step(stamp)))
    app.get('/', (c) => c.text('body'))

    expect((await app.request('/')).headers.get('x-stamped')).toBe('yes')
  })
})
