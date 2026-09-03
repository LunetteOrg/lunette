import { describe, expect, it, vi } from 'vitest'
import { scope } from '@lntt/scope'
import { z } from 'zod'
import { validated } from './validation.ts'

const Schema = z.object({ title: z.string().min(1) })

const fakeRes = () => {
  const calls: unknown[] = []
  const res = {
    status: vi.fn((code: number) => {
      calls.push(code)
      return res
    }),
    json: vi.fn((body: unknown) => {
      calls.push(body)
      return res
    }),
  }
  return { res, calls }
}

describe('validated', () => {
  const h = scope<{
    readonly req: { body: unknown }
    readonly res: ReturnType<typeof fakeRes>['res']
  }>()
    .step(validated(Schema))
    .step(async (_app: {}, ctx: { readonly body: { title: string } }) => `got ${ctx.body.title}`)

  it('writes 422 itself and stops, on an invalid body', async () => {
    const { res, calls } = fakeRes()
    await h({}, { req: { body: { title: '' } }, res })
    expect(calls[0]).toBe(422)
  })

  it('passes the parsed body through, writing nothing, on a valid one', async () => {
    const { res, calls } = fakeRes()
    const out = await h({}, { req: { body: { title: 'ok' } }, res })
    expect(out).toBe('got ok')
    expect(calls).toEqual([])
  })
})
