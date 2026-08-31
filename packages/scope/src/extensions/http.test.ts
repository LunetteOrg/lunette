import { describe, expect, it } from 'vitest'
import { standardSchema } from './standard-schema.ts'
import { z } from 'zod'
import type { Abort } from '../abort.ts'
import { scope } from '../scope.ts'
import type { RequestCarrier } from '../carrier.ts'
import {
  forbidden,
  html,
  http,
  httpError,
  json,
  notFound,
  readDefaultStatus,
  redirect,
  text,
  toResponse,
  unauthorized,
} from './http.ts'

const req = new Request('http://x/')

describe('the http constructors — each names its own intent', () => {
  it('httpError/notFound/forbidden/unauthorized all carry the `status` kind', () => {
    expect(httpError(400).intent).toEqual({ kind: 'status', status: 400 })
    expect(notFound({ e: 1 }).intent).toEqual({ kind: 'status', status: 404, body: { e: 1 } })
    expect(forbidden().intent).toEqual({ kind: 'status', status: 403 })
    expect(unauthorized().intent).toEqual({ kind: 'status', status: 401 })
  })

  it('redirect carries its own `redirect` kind, distinct from `status`', () => {
    expect(redirect('/login').intent).toEqual({ kind: 'redirect', location: '/login', status: 302 })
    expect(redirect('/x', 301).intent).toMatchObject({ status: 301 })
  })

  it('json/html/text all carry the `ok` kind under the value, unwrapped', () => {
    const j = json({ id: '1' }, 201)
    expect(j.value).toEqual({ id: '1' })
    expect(j.intent).toEqual({ kind: 'ok', status: 201, contentType: 'application/json' })
    expect(html('<p>hi</p>').intent).toMatchObject({ contentType: 'text/html; charset=utf-8' })
    expect(text('hi').intent).toMatchObject({ contentType: 'text/plain; charset=utf-8' })
  })
})

describe('toResponse — the three Outcome branches, rendered', () => {
  it('a plain value defaults to a 200 JSON response', () => {
    expect(toResponse({ ok: true, value: { a: 1 }, intent: undefined, effects: {} })).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    })
  })

  it('an ok() intent overrides the default, including a bodyless 204', () => {
    expect(
      toResponse({
        ok: true,
        value: null,
        intent: { kind: 'ok', status: 204, contentType: 'application/json' },
        effects: {},
      }),
    ).toEqual({ status: 204, headers: {}, body: null })
  })

  // `Outcome.abort` is `Abort<never>` — the FOLD's own erased shape, once an
  // intent has already been checked at the definition/mount gates — so these
  // fixtures cast, the way `run-fold.ts` itself does when it packs one in.
  it('a redirect abort becomes a Location header, no body', () => {
    const out = toResponse({ ok: false, abort: redirect('/login') as unknown as Abort<never>, effects: {} })
    expect(out).toEqual({ status: 302, headers: { location: '/login' }, body: null })
  })

  it('a status abort with a body renders it as JSON', () => {
    const out = toResponse({
      ok: false,
      abort: notFound({ error: 'gone' }) as unknown as Abort<never>,
      effects: {},
    })
    expect(out).toEqual({
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'gone' }),
    })
  })

  it('a status abort with no body renders bodyless', () => {
    expect(toResponse({ ok: false, abort: forbidden() as unknown as Abort<never>, effects: {} })).toEqual({
      status: 403,
      headers: {},
      body: null,
    })
  })

  it('the `invalid` branch renders 422, distinct from a host native 400', () => {
    const out = toResponse({
      ok: false,
      invalid: { issues: [{ message: 'bad', path: ['x'] }] },
      effects: {},
    })
    expect(out.status).toBe(422)
    expect(JSON.parse(out.body ?? '{}')).toEqual({ issues: [{ message: 'bad', path: ['x'] }] })
  })
})

describe('.status(n) — the route default, overridden by a per-outcome verb', () => {
  const schema = z.object({ id: z.string() })

  it('a leaf with no per-outcome verb renders the declared default', async () => {
    const s = scope(http)
      .extend(standardSchema)
      .validate('params', schema)
      .status(201)
      .handle((_deps: {}, ctx) => ({ id: ctx.params.id }))

    const out = await s({}, { ...{ request: req }, params: { id: '1' } })
    expect(readDefaultStatus(out)).toBe(201)
    expect(toResponse(out).status).toBe(201)
  })

  it('json(v, 201) on a leaf wins over the route default', async () => {
    const s = scope(http)
      .extend(standardSchema)
      .validate('params', schema)
      .status(200)
      .handle((_deps: {}, ctx) => json({ id: ctx.params.id }, 201))

    const out = await s({}, { ...{ request: req }, params: { id: '1' } })
    expect(toResponse(out).status).toBe(201)
  })

  it('with no `.status()` at all, the default stays 200', async () => {
    const s = scope(http)
      .handle(() => ({ ok: true }))
    const out = await s({}, { request: req, params: {} })
    expect(readDefaultStatus(out)).toBeUndefined()
    expect(toResponse(out).status).toBe(200)
  })
})

describe('ctx.request — read off the carrier, not seeded by the extension', () => {
  it('a guard reads the request the host seeded', async () => {
    const tagged = new Request('http://x/', { headers: { 'x-tag': 'yes' } })
    const s = scope(http)
      .handle((_deps: {}, ctx) => ({ tag: ctx.request.headers.get('x-tag') }))

    const out = await s({}, { request: tagged, params: {} })
    expect(out.ok && out.value).toEqual({ tag: 'yes' })
  })
})
