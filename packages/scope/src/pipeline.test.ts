import { describe, expect, it } from 'vitest'
import expressLib from 'express'
import request from 'supertest'
import { Hono } from 'hono'
import { z } from 'zod'
import { scope } from './index.ts'
import { fail, guards } from './guard/index.ts'
import * as ex from './express/index.ts'
import * as ho from './hono/index.ts'

// THE TWO SLICES MEETING, which is why they shipped together: an extension
// POPULATES an entry from the host, and a verb REFINES it. `body('json')` gives
// `unknown`; `validate('body', schema, onError)` gives the schema's output. The
// division of labour is the whole design — the extraction knows the host, the
// refinement knows nothing about it.
//
// It also shows the TWO failure points a real route has, reporting different
// things: "not JSON" and "JSON, but the wrong shape". Passing one constant to
// both is a choice, not a requirement.

const post = z.object({ title: z.string(), tags: z.array(z.string()) })

describe('Express: read, refine, answer', () => {
  const app = expressLib()

  app.post(
    '/posts',
    ex.express({ store: [] as string[] }).handler(
      scope(ex.expressCarrier())
        .extend(guards)
        .step(ex.body('json', (issues, { res }) => res.status(400).json({ error: 'not json', issues })))
        .validate('body', post, (issues, { res }) => res.status(422).json({ error: 'invalid', issues }))
        .step(ex.headers)
        .guard(
          (_a: {}, { headers }) => (headers.authorization ? { actor: headers.authorization } : fail()),
          (_i, { res }) => res.status(401).json({ error: 'unauthorized' }),
        )
        .step(async ({ store }: { readonly store: string[] }, { body, res }) => {
          store.push(body.title)
          return res.status(201).json({ title: body.title.toUpperCase(), tags: body.tags })
        }),
    ),
  )

  const send = (body: string) =>
    request(app).post('/posts').set('content-type', 'application/json').set('authorization', 'u1').send(body)

  it('the leaf reads the SCHEMA\'s type, not `unknown`', async () => {
    const res = await send('{"title":"hello","tags":["a"]}')
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ title: 'HELLO', tags: ['a'] })
  })

  it('a payload that is not JSON stops at the extension', async () => {
    const res = await send('nope')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('not json')
  })

  it('a payload that is JSON but the wrong shape stops at the verb', async () => {
    const res = await send('{"title":7}')
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('invalid')
  })
})

describe('Hono: the same scope shape, in its own idiom', () => {
  const app = new Hono()

  app.post(
    '/posts',
    ho.hono({}).handler(
      scope(ho.honoCarrier())
        .extend(guards)
        .step(ho.body('json', (_i, { c }) => c.json({ error: 'not json' }, 400)))
        .validate('body', post, (_i, { c }) => c.json({ error: 'invalid' }, 422))
        .step(async (_a: {}, { c, body }) => c.json({ title: body.title.toUpperCase() }, 201)),
    ),
  )

  const send = (body: string) =>
    app.request('/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body })

  it('answers with the leaf\'s value', async () => {
    const res = await send('{"title":"hello","tags":[]}')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ title: 'HELLO' })
  })

  it('and each failure lands in its own place', async () => {
    expect((await send('nope')).status).toBe(400)
    expect((await send('{"title":7,"tags":[]}')).status).toBe(422)
  })
})

describe('what the ORDER says, and where it is caught', () => {
  it('a guard reading an entry nothing populated yet is refused', () => {
    // Written the other way round — the guard before `ex.headers` — this file
    // answered 500 at runtime AND failed `tsc`. The same mistake, twice, and the
    // compile error is the one that arrives first.
    const refused = () => {
      scope(ex.expressCarrier())
        .extend(guards)
        // @ts-expect-error — no `headers` entry: `ex.headers` has not run
        .guard((_a: {}, { headers }) => (headers.x ? {} : fail()), () => null)
    }
    expect(typeof refused).toBe('function')
  })

  it('`validate` refuses a name nothing populated, so the extension must come first', () => {
    // Not a runtime claim — a compile-time one, and the reason the pipeline
    // reads the way it does. `body` has to be an entry before it can be refined.
    const refused = () => {
      // @ts-expect-error — no `body` entry: `ex.body(...)` has not run
      scope(ex.expressCarrier()).extend(guards).validate('body', post, () => null)
    }
    expect(typeof refused).toBe('function')
  })
})
