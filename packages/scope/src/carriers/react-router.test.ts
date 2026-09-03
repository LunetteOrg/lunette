import { describe, expect, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import * as httpCarrier from './http.ts'
import {
  answered,
  data,
  isWord,
  json,
  notFound,
  reactRouter,
  redirect,
  response,
} from './react-router.ts'

const head = (url = 'https://example.test/posts/1') => new Request(url)

describe('the carrier is a declaration and nothing else', () => {
  it('carries no runtime value at all', () => {
    expect(Object.keys(reactRouter)).toEqual([])
  })
})

describe("it speaks HTTP's words, and they are the SAME words", () => {
  it('re-exports http’s constructors rather than declaring lookalikes', () => {
    // Identity, not equivalence. Two constructors producing equal-looking
    // objects would be two WORDS, and a mount reading one would not read the
    // other — the same condition split in half by an import path.
    expect(notFound).toBe(httpCarrier.notFound)
    expect(redirect).toBe(httpCarrier.redirect)
    expect(json).toBe(httpCarrier.json)
    expect(response).toBe(httpCarrier.response)
  })

  it('so a 404 built here is a 404 built there', () => {
    expect(notFound('gone').intent).toEqual(httpCarrier.notFound('gone').intent)
  })
})

describe('the word that is this carrier’s own', () => {
  it('carries the value and a status, and defaults to 200', () => {
    const d = data({ title: 'a post' })
    expect(d.kind).toBe('rr-data')
    expect(d.intent).toEqual({ status: 200 })
    expect(d.value).toEqual({ title: 'a post' })
  })

  it('and takes the status it was given', () => {
    expect(data({ title: 'a post' }, 201).intent.status).toBe(201)
  })

  it('is a different word from http’s success annotation', () => {
    // They both carry a value and a status and are still not interchangeable:
    // one goes out as a body, the other back through React Router's own data
    // pipeline. The `kind` is what a mount branches on.
    expect(data('v').kind).not.toBe(response('v').kind)
  })
})

describe('telling a word from a domain value', () => {
  it('recognises every word this carrier can say', () => {
    expect(isWord(notFound())).toBe(true)
    expect(isWord(redirect('/'))).toBe(true)
    expect(isWord(response('v'))).toBe(true)
    expect(isWord(data('v'))).toBe(true)
  })

  it('and takes nothing else for one', () => {
    expect(isWord({ title: 'a post' })).toBe(false)
    expect(isWord({ intent: 'analytics' })).toBe(false)
    // Both names by coincidence is still a domain object — only a `kind` from
    // the closed set makes a word.
    expect(isWord({ kind: 'callout', intent: 'warning' })).toBe(false)
    expect(isWord(null)).toBe(false)
  })
})

describe('running for real', () => {
  it('carries the request and the matched params through the fold', async () => {
    const s = scope(reactRouter).step(async (_app: {}, ctx) =>
      data({ id: ctx.params['id'], path: new URL(ctx.request.url).pathname }),
    )

    const out = await s({}, { request: head('https://example.test/posts/7'), params: { id: '7' } })
    expect(out.value).toEqual({ id: '7', path: '/posts/7' })
  })

  it('and `answered` hands back what the inner steps returned, by reference', async () => {
    const post = { title: 'a post' }
    const word = data(post)
    const s = scope(reactRouter)
      .step(async (_app: {}, _ctx, next: Next<{}>) => answered<typeof post>(await next({})))
      .step(async (_app: {}, _ctx) => word)

    const out = await s({}, { request: head(), params: {} })
    expect(out).toBe(word)
    expect(isWord(out) && out.kind === 'rr-data' && out.value).toBe(post)
  })
})
