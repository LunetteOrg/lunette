import { describe, expect, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import {
  answered,
  conflict,
  forbidden,
  isWord,
  notFound,
  tooManyRequests,
  trpc,
  unauthorized,
  unprocessableContent,
} from './trpc.ts'

const head = (url = 'https://example.test/trpc/post.byId') => new Request(url)

describe('the carrier is a declaration and nothing else', () => {
  it('carries no runtime value at all', () => {
    expect(Object.keys(trpc)).toEqual([])
  })
})

describe('the codes', () => {
  it('each carry tRPC’s own name for the condition, not a status number', () => {
    // The whole reason this is a separate carrier: the SAME six conditions, in
    // a different alphabet. Numbers here would be a translation nobody asked
    // for, done in the wrong place.
    expect(notFound().intent.code).toBe('NOT_FOUND')
    expect(unauthorized().intent.code).toBe('UNAUTHORIZED')
    expect(forbidden().intent.code).toBe('FORBIDDEN')
    expect(conflict().intent.code).toBe('CONFLICT')
    expect(tooManyRequests().intent.code).toBe('TOO_MANY_REQUESTS')
    expect(unprocessableContent().intent.code).toBe('UNPROCESSABLE_CONTENT')
  })

  it('and share one kind, because they share one translation point', () => {
    expect(new Set([notFound().kind, conflict().kind, forbidden().kind]).size).toBe(1)
  })

  it('omit the message when none was given', () => {
    expect('message' in notFound().intent).toBe(false)
    expect(notFound('no such post').intent.message).toBe('no such post')
  })
})

describe('telling a word from a domain value', () => {
  it('recognises its own and takes nothing else for one', () => {
    expect(isWord(conflict())).toBe(true)
    expect(isWord({ title: 'a row' })).toBe(false)
    expect(isWord({ intent: 'analytics' })).toBe(false)
    // Both names by coincidence is still a domain object — only the `kind` this
    // carrier coins makes a word.
    expect(isWord({ kind: 'callout', intent: 'warning' })).toBe(false)
    expect(isWord(null)).toBe(false)
  })
})

describe('running for real', () => {
  it('carries the request and the input through the fold', async () => {
    const s = scope(trpc).step(async (_app: {}, ctx) => ({
      input: ctx.input,
      path: new URL(ctx.request.url).pathname,
    }))

    const out = await s({}, { request: head(), input: { id: 7 } })
    expect(out).toEqual({ input: { id: 7 }, path: '/trpc/post.byId' })
  })

  it('and `answered` hands back what the inner steps returned, by reference', async () => {
    const row = { title: 'a row' }
    const s = scope(trpc)
      .step(async (_app: {}, _ctx, next: Next<{}>) => answered<typeof row>(await next({})))
      .step(async (_app: {}, _ctx) => row)

    expect(await s({}, { request: head(), input: undefined })).toBe(row)
  })
})
