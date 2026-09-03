import { describe, expect, it, vi } from 'vitest'
import { scope } from '@lntt/scope'
import { z } from 'zod'
import { jsonBody, validated } from './validation.ts'

const Schema = z.object({ title: z.string().min(1) })

const fakeC = (json: () => Promise<unknown>) => {
  const calls: unknown[] = []
  const c = {
    req: { json },
    json: vi.fn((body: unknown, status: number) => {
      calls.push(status, body)
      return body
    }),
  }
  return { c, calls }
}

describe('jsonBody + validated', () => {
  const h = scope<{ readonly c: ReturnType<typeof fakeC>['c'] }>()
    .step(jsonBody)
    .step(validated(Schema))
    .step(async (_app: {}, ctx: { readonly body: { title: string } }) => `got ${ctx.body.title}`)

  it('writes 422 itself and stops, on a well-formed but invalid body', async () => {
    const { c, calls } = fakeC(() => Promise.resolve({ title: '' }))
    await h({}, { c })
    expect(calls[0]).toBe(422)
  })

  it('passes the parsed body through, writing nothing, on a valid one', async () => {
    const { c, calls } = fakeC(() => Promise.resolve({ title: 'ok' }))
    const out = await h({}, { c })
    expect(out).toBe('got ok')
    expect(calls).toEqual([])
  })

  it('a genuine read failure (malformed JSON, or worse) THROWS from `jsonBody` — `validated` never sees it', async () => {
    const { c } = fakeC(() => Promise.reject(new SyntaxError('Unexpected token')))
    await expect(h({}, { c })).rejects.toBeInstanceOf(SyntaxError)
  })
})
