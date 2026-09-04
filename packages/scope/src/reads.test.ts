import { describe, expect, it } from 'vitest'
import expressLib from 'express'
import type { Request, Response } from 'express'
import request from 'supertest'
import { Hono } from 'hono'
import { scope } from './index.ts'
import type { Cookies, Query, Headers_ } from './reads.ts'
import * as ex from './express/index.ts'
import * as ho from './hono/index.ts'
import * as rr from './react-router/index.ts'

// WHAT THE READ EXTENSIONS ARE FOR, in the half that has to run: the extraction
// is per host, and everything DOWNSTREAM of it is not. The step below is written
// ONCE, names no carrier, and reads the same three entries on all three hosts
// that have a request to read.
//
// Without them that step cannot be written at all: either it annotates `c` and
// lives on Hono, or it does not touch the request — `carrier-free.test.ts` pins
// exactly that. This is the middle ground, and the reason it exists.
const summary = async (
  _app: {},
  {
    query,
    cookies,
    headers,
  }: { readonly query: Query; readonly cookies: Cookies; readonly headers: Headers_ },
) => ({
  page: query.page,
  tags: query.tag,
  session: cookies.session,
  agent: headers['x-agent'],
})

const expected = {
  page: '2',
  tags: ['a', 'b'],
  session: 'abc',
  agent: 'probe',
}

describe('one step, written once, reads the same entries on every host', () => {
  it('Express', async () => {
    const app = expressLib()
    app.get(
      '/',
      ex.express({}).handler(
        scope(ex.expressCarrier())
          .step(ex.query)
          .step(ex.cookies)
          .step(ex.headers)
          .step(async (_a: {}, ctx) => ctx.res.json(await summary({}, ctx))),
      ),
    )

    const res = await request(app)
      .get('/?page=2&tag=a&tag=b')
      .set('cookie', 'session=abc')
      .set('x-agent', 'probe')

    expect(res.body).toEqual(expected)
  })

  it('Hono', async () => {
    const app = new Hono()
    app.get(
      '/',
      ho.hono({}).handler(
        scope(ho.honoCarrier())
          .step(ho.query)
          .step(ho.cookies)
          .step(ho.headers)
          .step(async (_a: {}, ctx) => ctx.c.json(await summary({}, ctx))),
      ),
    )

    const res = await app.request('/?page=2&tag=a&tag=b', {
      headers: { cookie: 'session=abc', 'x-agent': 'probe' },
    })

    expect(await res.json()).toEqual(expected)
  })

  it('React Router', async () => {
    const loader = rr.reactRouter({}).loader(
      scope(rr.reactRouterCarrier())
        .step(rr.query)
        .step(rr.cookies)
        .step(rr.headers)
        .step(async (_a: {}, ctx) => summary({}, ctx)),
    )

    const out = await loader({
      request: new Request('http://host/?page=2&tag=a&tag=b', {
        headers: { cookie: 'session=abc', 'x-agent': 'probe' },
      }),
      params: {},
    })

    expect(out).toEqual(expected)
  })
})

describe('what the entries hold before anyone validates them', () => {
  it('a repeated query key is an ARRAY, a single one is a string', async () => {
    const loader = rr.reactRouter({}).loader(
      scope(rr.reactRouterCarrier())
        .step(rr.query)
        .step(async (_a: {}, { query }) => query),
    )

    expect(await loader({ request: new Request('http://h/?a=1&b=2&b=3'), params: {} })).toEqual({
      a: '1',
      b: ['2', '3'],
    })
  })

  it('header names are lower-cased, so a step reads one spelling', async () => {
    const loader = rr.reactRouter({}).loader(
      scope(rr.reactRouterCarrier())
        .step(rr.headers)
        .step(async (_a: {}, { headers }) => headers['x-mixed']),
    )

    const request_ = new Request('http://h/', { headers: { 'X-MiXeD': 'yes' } })
    expect(await loader({ request: request_, params: {} })).toBe('yes')
  })

  it('a cookie value keeps its own `=`, and is URL-decoded', async () => {
    const loader = rr.reactRouter({}).loader(
      scope(rr.reactRouterCarrier())
        .step(rr.cookies)
        .step(async (_a: {}, { cookies }) => cookies),
    )

    const request_ = new Request('http://h/', {
      headers: { cookie: 'token=a=b=c; name=Ada%20L; broken' },
    })
    expect(await loader({ request: request_, params: {} })).toEqual({
      token: 'a=b=c',
      name: 'Ada L',
    })
  })
})

describe('`body`: reading and parsing fail for opposite reasons', () => {
  const parsed = (encoding: 'json' | 'form') =>
    rr.reactRouter({}).action(
      scope(rr.reactRouterCarrier())
        .step(rr.body(encoding, (issues) => ({ error: issues[0]?.message })))
        .step(async (_a: {}, { body }) => ({ got: body })),
    )

  it('parses a JSON payload into the entry', async () => {
    const out = await parsed('json')({
      request: new Request('http://h/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"title":"hello"}',
      }),
      params: {},
    })

    expect(out).toEqual({ got: { title: 'hello' } })
  })

  it('a MALFORMED payload is a domain outcome: it reaches `onError`', async () => {
    const out = await parsed('json')({
      request: new Request('http://h/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json at all',
      }),
      params: {},
    })

    expect(out).toEqual({ error: 'the body is not valid JSON' })
  })

  it('a DEAD STREAM is infrastructure: it throws past `onError` entirely', async () => {
    // The distinction that cost a bug: one `catch` over both told the client its
    // payload was malformed when the connection had broken — a 5xx hidden
    // behind a 4xx.
    let onErrorRan = false

    const action = rr.reactRouter({}).action(
      scope(rr.reactRouterCarrier())
        .step(
          rr.body('json', () => {
            onErrorRan = true
            return { error: 'invalid' }
          }),
        )
        .step(async (_a: {}, { body }) => body),
    )

    const dead = new Request('http://h/', {
      method: 'POST',
      body: new ReadableStream({
        start: (c) => c.error(new Error('the connection died')),
      }),
      duplex: 'half',
    })

    await expect(action({ request: dead, params: {} })).rejects.toThrow()
    expect(onErrorRan).toBe(false)
  })

  it('parses a form payload into the same ONE ctx key', async () => {
    const out = await parsed('form')({
      request: new Request('http://h/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'title=hello&tag=a',
      }),
      params: {},
    })

    expect(out).toEqual({ got: { title: 'hello', tag: 'a' } })
  })
})

describe('Express `body`: the two worlds a Node request can be in', () => {
  const route = (app: expressLib.Express) =>
    app.post(
      '/',
      ex.express({}).handler(
        scope(ex.expressCarrier())
          .step(ex.body('json', (issues, ctx) => ctx.res.status(422).json({ issues })))
          .step(async (_a: {}, ctx) => ctx.res.json({ got: ctx.body })),
      ),
    )

  it('reads the stream itself when no body parser is mounted', async () => {
    const app = expressLib()
    route(app)

    const res = await request(app).post('/').set('content-type', 'application/json').send('{"a":1}')
    expect(res.body).toEqual({ got: { a: 1 } })
  })

  it('uses what a mounted parser already produced, since the stream is consumed', async () => {
    const app = expressLib()
    app.use(expressLib.json())
    route(app)

    const res = await request(app).post('/').send({ a: 1 })
    expect(res.body).toEqual({ got: { a: 1 } })
  })

  it('a malformed payload reaches `onError` when the stream is ours', async () => {
    const app = expressLib()
    route(app)

    const res = await request(app)
      .post('/')
      .set('content-type', 'application/json')
      .send('not json')

    expect(res.status).toBe(422)
    expect(res.body.issues[0].message).toBe('the body is not valid JSON')
  })
})

// ── every key below is the CLIENT's ─────────────────────────────────────────
describe('a client-chosen key cannot reach the prototype', () => {
  const readAll = rr.reactRouter({}).loader(
    scope(rr.reactRouterCarrier())
      .step(rr.query)
      .step(rr.cookies)
      .step(rr.headers)
      .step(async (_a: {}, { query, cookies, headers }) => ({ query, cookies, headers })),
  )

  it('keeps `__proto__` as an OWN property instead of running the setter', async () => {
    // On an ordinary object literal this assignment runs the inherited setter:
    // the value vanishes without a word, and a crafted one reaches the prototype
    // of the object a step is handed.
    const out = (await readAll({
      request: new Request('http://h/?__proto__=polluted', {
        headers: { cookie: '__proto__=polluted' },
      }),
      params: {},
    })) as { query: Record<string, unknown>; cookies: Record<string, unknown> }

    expect(Object.getPrototypeOf(out.query)).toBe(null)
    expect(Object.hasOwn(out.query, '__proto__')).toBe(true)
    expect(out.query['__proto__']).toBe('polluted')
    expect(out.cookies['__proto__']).toBe('polluted')
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('a repeated `__proto__` does not corrupt the bag it is written into', async () => {
    const out = (await readAll({
      request: new Request('http://h/?__proto__=a&__proto__=b&ok=1'),
      params: {},
    })) as { query: Record<string, unknown> }

    expect(out.query['__proto__']).toEqual(['a', 'b'])
    expect(out.query.ok).toBe('1')
  })
})

describe('Express `body`: a parsed body does not say what parsed it', () => {
  it('refuses a JSON payload where the step asked for a form', async () => {
    // `express.json()` mounted app-wide leaves an object behind whatever the
    // route asked for. Without the check this handed JSON on as form fields —
    // no error, no `onError`, wrong data.
    const app = expressLib()
    app.use(expressLib.json())
    app.post(
      '/',
      ex.express({}).handler(
        scope(ex.expressCarrier())
          .step(ex.body('form', (issues, ctx) => ctx.res.status(415).json({ issues })))
          .step(async (_a: {}, ctx) => ctx.res.json({ got: ctx.body })),
      ),
    )

    const res = await request(app).post('/').send({ a: 1 })
    expect(res.status).toBe(415)
    expect(res.body.issues[0].message).toContain('not form')
  })

  it('accepts it when the encoding the client sent is the one asked for', async () => {
    const app = expressLib()
    app.use(expressLib.urlencoded({ extended: false }))
    app.post(
      '/',
      ex.express({}).handler(
        scope(ex.expressCarrier())
          .step(ex.body('form', (issues, ctx) => ctx.res.status(415).json({ issues })))
          .step(async (_a: {}, ctx) => ctx.res.json({ got: ctx.body })),
      ),
    )

    const res = await request(app).post('/').type('form').send({ a: '1' })
    expect(res.body).toEqual({ got: { a: '1' } })
  })
})

// ── whoever parses first owns the error path ────────────────────────────────
// The behavioural difference a mounted parser makes, measured rather than
// described — the reason `express/index.ts` says not to mount one on a route
// whose scope reads the body.
describe('Express `body`: what a mounted parser changes', () => {
  const routed = (parser: boolean) => {
    const app = expressLib()
    if (parser) app.use(expressLib.json())
    app.post(
      '/',
      ex.express({}).handler(
        scope(ex.expressCarrier())
          .step(ex.body('json', (issues, ctx) => ctx.res.status(422).json({ from: 'onError', issues })))
          .step(async (_a: {}, ctx) => ctx.res.json({ from: 'leaf', body: ctx.body })),
      ),
    )
    app.use((_e: unknown, _q: Request, res: Response, _n: () => void) =>
      res.status(400).json({ from: 'express' }),
    )
    return app
  }

  it('an INVALID payload is Express\'s to report when its parser ran first', async () => {
    const res = await request(routed(true)).post('/').set('content-type', 'application/json').send('nope')

    expect(res.status).toBe(400)
    expect(res.body.from).toBe('express')
  })

  it('and is this `onError`\'s when the stream was ours', async () => {
    const res = await request(routed(false)).post('/').set('content-type', 'application/json').send('nope')

    expect(res.status).toBe(422)
    expect(res.body.from).toBe('onError')
  })

  it('an EMPTY body reaches the leaf as `{}` with a parser, and stops without one', async () => {
    const withParser = await request(routed(true)).post('/').set('content-type', 'application/json').send('')
    expect(withParser.body).toEqual({ from: 'leaf', body: {} })

    const without = await request(routed(false)).post('/').set('content-type', 'application/json').send('')
    expect(without.status).toBe(422)
  })
})
