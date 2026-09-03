import { describe, expect, it, vi } from 'vitest'
import { scope } from '@lntt/scope'
import { requireActor } from './guards.ts'

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

describe('requireActor', () => {
  const h = scope<{
    readonly req: { header: (name: string) => string | undefined }
    readonly res: ReturnType<typeof fakeRes>['res']
  }>()
    .step(requireActor)
    .step(async (_app: {}, ctx: { readonly actor: string }) => `hello ${ctx.actor}`)

  it('writes 401 itself and stops, when the header is missing', async () => {
    const { res, calls } = fakeRes()
    const req = { header: () => undefined }
    await h({}, { req, res })
    expect(calls).toEqual([401, { error: 'unauthorized' }])
  })

  it('passes the actor through when the header is there, writing nothing', async () => {
    const { res, calls } = fakeRes()
    const req = { header: () => 'u1' }
    const out = await h({}, { req, res })
    expect(out).toBe('hello u1')
    expect(calls).toEqual([])
  })
})
