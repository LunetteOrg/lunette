import { Hono } from 'hono'
import { hc } from 'hono/client'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { hono, honoCarrier } from './index.ts'

// THE TYPE CONTRACT for the pattern and the route gate — both type-level, so no
// runtime test could make them. NOTHING HERE RUNS.

const { route } = hono({})

const byId = scope(honoCarrier<'/posts/:id'>()).step(async (_app: {}, { c }) => {
  expectTypeOf(c.req.param('id')).toEqualTypeOf<string>()
  return c.json({ id: c.req.param('id') })
})

// Names no pattern: reads nothing in particular, and mounts anywhere.
const wide = scope(honoCarrier()).step(async (_app: {}, { c }) => c.text(''))

describe('what the declared pattern types', () => {
  it('refuses a param the declared pattern does not name', () => {
    scope(honoCarrier<'/posts/:id'>()).step(async (_app: {}, { c }) => {
      // @ts-expect-error — `author` is not in `/posts/:id`, so it is
      // `string | undefined` and not usable as a string
      const author: string = c.req.param('author')
      return c.text(author)
    })
  })
})

describe('`route(path, scope)`: what the scope READS against what the route SUPPLIES', () => {
  it('accepts the pattern the scope was written for', () => {
    new Hono().get(...route('/posts/:id', byId))
  })

  it('rejects a pattern that supplies a different param', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts/:postId', byId)
  })

  it('rejects a pattern that supplies none', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts', byId)
  })

  it('accepts a DIFFERENT pattern supplying the same param — names, not literals', () => {
    route('/archive/:id', byId)
  })

  it('ACCEPTS a route supplying more than the scope reads', () => {
    route('/tenants/:tenant/posts/:id', byId)
    route('/posts/:id', wide)
  })

  it('has NO OPINION on a pattern it cannot read', () => {
    const dynamic: string = '/posts/:id'
    route(dynamic, byId)
  })

  it('hands back the pattern as its literal, so the mount stays typed', () => {
    expectTypeOf(route('/posts/:id', byId)[0]).toEqualTypeOf<'/posts/:id'>()
  })
})

describe('`route(scope)`: the plain handler, with nothing checked', () => {
  it('is a Hono handler, mountable anywhere', () => {
    // Nothing compares the pattern here — including this, which is wrong and
    // compiles. `route(path, scope)` is the form that catches it.
    new Hono().get('/posts/:postId', route(byId))
  })
})

describe('the typed RPC client reads what the scope hands back', () => {
  // Hono's `hc<typeof app>()` reads the SCHEMA off the app: path, method, and
  // the handler's return type. A mount declared `Promise<Response>` erases the
  // last one and the client answers `unknown`, so what the mount hands back is
  // what the SCOPE hands back.
  const showPost = scope(honoCarrier<'/posts/:id'>()).step(async (_app: {}, { c }) =>
    c.json({ id: c.req.param('id'), title: 'x' }),
  )
  const health = scope(honoCarrier()).step(async (_app: {}, { c }) => c.json({ ok: true }, 201))

  // Routes are CHAINED, which is how `typeof app` accumulates the schema.
  const app = new Hono()
    .get('/posts/:id', route(showPost))
    .get(...route('/health', health))

  const client = hc<typeof app>('http://localhost')

  it('carries the leaf\'s value through the one-argument form', async () => {
    const res = await client.posts[':id'].$get({ param: { id: '1' } })
    expectTypeOf(await res.json()).toEqualTypeOf<{ id: string; title: string }>()
  })

  it('carries it through the checked form too, status included', async () => {
    const res = await client.health.$get()
    // the STATUS arrives as its literal, and so does the value the leaf built:
    // nothing between the leaf and the client widens either
    expectTypeOf(res.status).toEqualTypeOf<201>()
    expectTypeOf(await res.json()).toEqualTypeOf<{ ok: true }>()
  })
})
