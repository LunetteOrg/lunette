import { describe, expect, it } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { scope } from '@lntt/scope'
import { requireActor } from './guards.ts'

describe('requireActor', () => {
  const h = scope<{ readonly c: { req: { header: (name: string) => string | undefined } } }>()
    .step(requireActor)
    .step(async (_app: {}, ctx: { readonly actor: string }) => `hello ${ctx.actor}`)

  it('throws an HTTPException(401) itself, when the header is missing', async () => {
    const c = { req: { header: () => undefined } }
    await expect(h({}, { c })).rejects.toBeInstanceOf(HTTPException)
  })

  it('passes the actor through when the header is there, throwing nothing', async () => {
    const c = { req: { header: () => 'u1' } }
    const out = await h({}, { c })
    expect(out).toBe('hello u1')
  })
})
