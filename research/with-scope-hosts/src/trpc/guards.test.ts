import { describe, expect, it } from 'vitest'
import { TRPCError } from '@trpc/server'
import { scope } from '@lntt/scope'
import { requireActor } from './guards.ts'
import { trpcCarrier, type Context } from './carrier.ts'

describe('requireActor', () => {
  const h = scope(trpcCarrier)
    .step(requireActor)
    .step(async (_app: {}, ctx: { readonly actor: string }) => `hello ${ctx.actor}`)

  it('throws TRPCError UNAUTHORIZED itself, when ctx has no actorId', async () => {
    const ctx: Context = { actorId: undefined }
    await expect(h({}, { input: undefined, ctx })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(h({}, { input: undefined, ctx })).rejects.toBeInstanceOf(TRPCError)
  })

  it('passes the actor through when ctx carries one, throwing nothing', async () => {
    const ctx: Context = { actorId: 'u1' }
    const out = await h({}, { input: undefined, ctx })
    expect(out).toBe('hello u1')
  })
})
