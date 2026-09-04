import { Hono } from 'hono'
import { hc } from 'hono/client'
import { describe, expectTypeOf, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import { hono, honoCarrier } from './index.ts'
import { expressCarrier } from '../express/index.ts'

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

  it('rejects an OPTIONAL supply for a required demand: `/posts/:id?` also matches `/posts`', () => {
    // Hono keeps the `?` in the key, and it is the whole claim: mounted here
    // the route answers `/posts` too, where `c.req.param('id')` is `undefined`
    // against a step whose type says `string`.
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts/:id?', byId)
  })

  it('accepts either supply for an OPTIONAL demand — the step already reads undefined', () => {
    const maybeById = scope(honoCarrier<'/posts/:id?'>()).step(async (_app: {}, { c }) =>
      c.json({ id: c.req.param('id') ?? null }),
    )

    route('/posts/:id?', maybeById)
    route('/posts/:id', maybeById)
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

describe('the mounts owe the scope its chain: `DepGuard` rides every mount', () => {
  // The deps are curried at `hono({})`, so an empty chain reaches the scope —
  // and a scope demanding a `db` must be refused HERE, at the mount, exactly as
  // a direct call is.
  const needsDb = scope(honoCarrier()).step(async ({ db }: { readonly db: string }, { c }) =>
    c.json({ db }),
  )

  it('refuses a scope the curried chain does not satisfy', () => {
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    route(needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    route('/', needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    hono({}).mw(needsDb)
  })

  it('accepts it on a chain that does — a superset passes, as everywhere', () => {
    const withDb = hono({ db: 'pg', extra: 1 })
    withDb.route(needsDb)
    withDb.route('/', needsDb)
    withDb.mw(needsDb)
  })
})

describe('a middleware may not derive a ctx key the run itself brought', () => {
  it('refuses it, because the leaf strips those by name before reaching c.set', () => {
    const shadows = scope(honoCarrier()).step(
      async (_app: {}, _ctx, next: Next<{ c: string }>) => next({ c: 'mine' }),
    )

    // @ts-expect-error ⛔ this middleware derives a ctx key the run itself brought: c
    hono({}).mw(shadows)
  })

  it('a ROUTE takes no such gate: it copies nothing out, so nothing is stripped', () => {
    // The key is `next` rather than `c` so the leaf can still answer: shadowing
    // `c` is legal too, and then the step after it reads the DERIVED value —
    // which is `Ctx`'s own decision, pinned in the core.
    route(
      scope(honoCarrier())
        .step(async (_app: {}, _ctx, next: Next<{ next: string }>) => next({ next: 'mine' }))
        .step(async (_app: {}, { c }) => c.json({})),
    )
  })
})

describe('a mount takes a scope written for ITS carrier, and no other', () => {
  const forExpress = scope(expressCarrier()).step(async (_app: {}, { res }) => res.json({}))

  it('refuses a scope written for another host', () => {
    // @ts-expect-error — this scope reads `req`/`res`; a Hono mount brings `c`
    route(forExpress)
    // @ts-expect-error — this scope reads `req`/`res`; a Hono mount brings `c`
    route('/', forExpress)
    // @ts-expect-error — this scope reads `req`/`res`; a Hono mount brings `c`
    hono({}).mw(forExpress)
  })

  it('still accepts a scope carrying the app\'s own env', () => {
    // The gate states the CONTEXT the mount hands over, so an env written once
    // at `hono<typeof deps, MyEnv>(deps)` has to keep passing.
    type MyEnv = { Bindings: { KV: string }; Variables: { rid: string } }

    const reads = scope(honoCarrier<'/p/:id', MyEnv>()).step(async (_app: {}, { c }) =>
      c.json({ id: c.req.param('id'), kv: c.env.KV }),
    )

    hono<{}, MyEnv>({}).route('/p/:id', reads)
  })
})

describe('a middleware answers with a Response, or with nothing', () => {
  it('refuses a guard that stops by returning a domain value', () => {
    // Hono sees `undefined` with the chain uncalled and answers 500; a `route`
    // needs no such gate, since its mount hands back what the scope handed back
    // and Hono's own handler type reads it.
    const returnsAnError = scope(honoCarrier()).step(
      async (_app: {}, _ctx, next: Next<{ actor: string }>) =>
        Math.random() > 0.5 ? ({ error: 'unauthorized' } as const) : next({ actor: 'u1' }),
    )

    // @ts-expect-error ⛔ a middleware answers with a Response
    hono({}).mw(returnsAnError)
  })

  it('accepts the same guard answering with `c.json`', () => {
    hono({}).mw(
      scope(honoCarrier()).step(async (_app: {}, { c }, next: Next<{ actor: string }>) =>
        Math.random() > 0.5 ? c.json({ error: 'unauthorized' }, 401) : next({ actor: 'u1' }),
      ),
    )
  })
})
