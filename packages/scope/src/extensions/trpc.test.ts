import { describe, expect, it } from 'vitest'
import { standardSchema } from './standard-schema.ts'
import { z } from 'zod'
import { scope } from '../scope.ts'
import type { RequestCarrier } from '../carrier.ts'
import {
  conflict,
  forbidden,
  notFound,
  rpc,
  tooManyRequests,
  unauthorized,
  unprocessableContent,
} from './trpc.ts'

const req = new Request('http://x/')

describe('the rpc constructors — every word coins the SAME declared name', () => {
  it('each carries the code it names, under the `code` kind', () => {
    expect(notFound().intent).toEqual({ kind: 'code', code: 'NOT_FOUND' })
    expect(unauthorized('nope').intent).toEqual({
      kind: 'code',
      code: 'UNAUTHORIZED',
      message: 'nope',
    })
    expect(forbidden().intent).toEqual({ kind: 'code', code: 'FORBIDDEN' })
    expect(conflict().intent).toEqual({ kind: 'code', code: 'CONFLICT' })
    expect(tooManyRequests().intent).toEqual({ kind: 'code', code: 'TOO_MANY_REQUESTS' })
    expect(unprocessableContent().intent).toEqual({ kind: 'code', code: 'UNPROCESSABLE_CONTENT' })
  })
})

describe("validate('input', schema) — the payload entry, distinct from http's params", () => {
  it('feeds the fold the same way params does, under ctx.input', async () => {
    const schema = z.object({ id: z.string() })
    const s = scope(rpc)
      .extend(standardSchema)
      .validate('input', schema)
      .handle((_deps: {}, ctx) => ({ id: ctx.input.id }))

    const out = await s({}, { request: req, input: { id: '1' } })
    expect(out.ok && out.value).toEqual({ id: '1' })
  })
})

describe('ctx.request — read off the carrier, same shape as http', () => {
  it('a guard reads the request the host seeded', async () => {
    const tagged = new Request('http://x/', { headers: { 'x-tag': 'yes' } })
    const s = scope(rpc)
      .handle((_deps: {}, ctx) => ({ tag: ctx.request.headers.get('x-tag') }))

    const out = await s({}, { request: tagged, input: undefined })
    expect(out.ok && out.value).toEqual({ tag: 'yes' })
  })
})
