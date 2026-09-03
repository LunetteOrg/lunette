import { describe, expect, it } from 'vitest'
import { scope } from '@lntt/scope'
import { requireActor } from './guards.ts'
import { reactRouterCarrier } from './carrier.ts'

describe('requireActor', () => {
  const h = scope(reactRouterCarrier)
    .step(requireActor)
    .step(async (_app: {}, ctx: { readonly actor: string }) => `hello ${ctx.actor}`)

  const request = (headers: HeadersInit = {}) => new Request('http://localhost/posts/1/publish', { headers })

  it('throws a data() envelope with status 401, when the header is missing', async () => {
    await expect(h({}, { request: request(), params: {} })).rejects.toMatchObject({
      data: { error: 'unauthorized' },
      init: { status: 401 },
    })
  })

  it('passes the actor through when the header is there, throwing nothing', async () => {
    const out = await h({}, { request: request({ 'x-actor-id': 'u1' }), params: {} })
    expect(out).toBe('hello u1')
  })
})
