import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import { runFold } from '../run-fold.ts'
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

describe('.input(schema) — the payload channel, distinct from http .params', () => {
  it('feeds the fold the same way params does, under ctx.params', async () => {
    const schema = z.object({ id: z.string() })
    const s = scope()
      .extend(rpc)
      .input(schema)
      .handle((_deps: {}, ctx) => ({ id: ctx.params.id }))

    const out = await runFold<RequestCarrier, { id: string }>(s, {}, { request: req }, { id: '1' })
    expect(out.ok && out.value).toEqual({ id: '1' })
  })
})

describe('ctx.request — read off the carrier, same shape as http', () => {
  it('a guard reads the request the host handed to runFold', async () => {
    const tagged = new Request('http://x/', { headers: { 'x-tag': 'yes' } })
    const s = scope()
      .extend(rpc)
      .handle((_deps: {}, ctx) => ({ tag: ctx.request.headers.get('x-tag') }))

    const out = await runFold<RequestCarrier, { tag: string | null }>(s, {}, { request: tagged }, {})
    expect(out.ok && out.value).toEqual({ tag: 'yes' })
  })
})
