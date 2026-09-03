import { describe, expect, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import {
  answered,
  forbidden,
  html,
  http,
  httpError,
  isWord,
  json,
  notFound,
  redirect,
  response,
  text,
  unauthorized,
} from './http.ts'

// What a mount hands over: a real Fetch `Request`, which a `RequestHead`
// parameter accepts as it stands — the headless view REMOVES members, so the
// full request satisfies it and the narrowing happens at the type level only.
const head = (url = 'https://example.test/p/1', init: RequestInit = {}) => new Request(url, init)

describe('the carrier is a declaration and nothing else', () => {
  it('carries no runtime value at all', () => {
    // PURE DECLARATION. `scope(http)` reads it entirely at the type level, so
    // there is nothing here to inject — and a carrier that grew a member would
    // be a carrier doing fold work, which is what it may not be.
    expect(Object.keys(http)).toEqual([])
    expect(typeof http).toBe('object')
  })
})

describe('the refusals', () => {
  it('each carry their own status, under one name', () => {
    expect(notFound().intent.status).toBe(404)
    expect(unauthorized().intent.status).toBe(401)
    expect(forbidden().intent.status).toBe(403)
    expect(httpError(503).intent.status).toBe(503)
  })

  it('omit the message when none was given, rather than carrying `undefined`', () => {
    // Under `exactOptionalPropertyTypes` an absent key and an explicit
    // `undefined` are different types, and a mount reading `'message' in
    // intent` reads the difference. Spreading `undefined` in would make every
    // refusal look like it carried an empty message.
    expect('message' in notFound().intent).toBe(false)
    expect('message' in notFound('gone for good').intent).toBe(true)
    expect(notFound('gone for good').intent.message).toBe('gone for good')
  })
})

describe('the redirect', () => {
  it('defaults to 302 and carries where to', () => {
    expect(redirect('/new').intent).toEqual({ location: '/new', status: 302 })
  })

  it('and takes a permanent one when asked', () => {
    expect(redirect('/new', 301).intent.status).toBe(301)
  })
})

describe('the success side', () => {
  it('defaults to 200 with no headers, and keeps the value', () => {
    const r = response({ n: 1 })
    expect(r.intent).toEqual({ status: 200, headers: {} })
    expect(r.value).toEqual({ n: 1 })
  })

  it('the sugar presets a content type and nothing else', () => {
    expect(json({ n: 1 }).intent.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    })
    expect(html('<p/>').intent.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(text('plain').intent.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(text('plain').value).toBe('plain')
  })

  it("and a caller's own content type wins over the preset", () => {
    // What the comment on `typed` claims. The preset is a default, not an
    // overrule: `json` is how a caller says "this is a body I want serialised",
    // and a caller naming `application/problem+json` means it.
    const r = json({ n: 1 }, { headers: { 'content-type': 'application/problem+json' } })
    expect(r.intent.headers['content-type']).toBe('application/problem+json')
  })

  it('and the caller keeps the status they asked for', () => {
    expect(json({ n: 1 }, { status: 201 }).intent.status).toBe(201)
  })
})

describe('telling a word from a domain value', () => {
  it('recognises every word this carrier coins', () => {
    expect(isWord(notFound())).toBe(true)
    expect(isWord(redirect('/'))).toBe(true)
    expect(isWord(response('v'))).toBe(true)
  })

  it('and takes nothing else for one', () => {
    expect(isWord({ title: 'a post' })).toBe(false)
    expect(isWord(null)).toBe(false)
    expect(isWord('a string')).toBe(false)
    // Both members are asked for, so a domain object carrying one of the two
    // names by coincidence is still a domain object.
    expect(isWord({ intent: 'analytics' })).toBe(false)
    expect(isWord({ kind: 'post' })).toBe(false)
    // And carrying BOTH by coincidence is still a domain object: `kind` and
    // `intent` are ordinary words a CMS block or an analytics record uses. Only
    // a `kind` this carrier actually coins makes a word.
    expect(isWord({ kind: 'callout', intent: 'warning' })).toBe(false)
  })
})

describe('`answered`, running for real', () => {
  it('hands back exactly what the inner steps returned, unchanged', async () => {
    // The claim the comment makes: it does not COPY. What comes back is the
    // app's own object, by reference — which is what makes the read-only view a
    // statement about who may write rather than a wall.
    const post = { title: 'a post' }
    const seen: unknown[] = []

    const s = scope(http)
      .step(async (_app: {}, _ctx, next: Next<{}>) => {
        const inner = answered<typeof post>(await next({}))
        seen.push(inner)
        return inner
      })
      .step(async (_app: {}, _ctx) => post)

    const out = await s({}, { request: head(), params: {} })
    expect(seen[0]).toBe(post)
    expect(out).toBe(post)
  })

  it('and reaches a word the same way', async () => {
    const s = scope(http)
      .step(async (_app: {}, _ctx, next: Next<{}>) => answered<never>(await next({})))
      .step(async (_app: {}, _ctx) => notFound('no such post'))

    const out = await s({}, { request: head(), params: {} })
    expect(isWord(out) && out.intent).toEqual({ status: 404, message: 'no such post' })
  })
})

describe('the run parameters reach the steps', () => {
  it('carries the request and the matched params through the fold', async () => {
    const s = scope(http).step(async (_app: {}, ctx) => ({
      method: ctx.request.method,
      id: ctx.params['id'],
      auth: ctx.request.headers.get('authorization'),
    }))

    const out = await s(
      {},
      {
        request: head('https://example.test/p/7', {
          method: 'POST',
          headers: { authorization: 'Bearer t' },
        }),
        params: { id: '7' },
      },
    )
    expect(out).toEqual({ method: 'POST', id: '7', auth: 'Bearer t' })
  })
})
