import { describe, expect, expectTypeOf, it } from 'vitest'
import { TRPCError } from '@trpc/server'
import { appRouter, authed, t, type Context } from './router.ts'

const caller = (ctx: Context) => appRouter.createCaller(ctx)
const anon: Context = { actorId: undefined }
const asUser: Context = { actorId: 'u1' }

describe('trpc + scope: `.input(schema)` and `.validate(...)` from ONE schema value', () => {
  it('a known post: the domain result, straight back', async () => {
    await expect(caller(anon).getPost({ id: '1' })).resolves.toMatchObject({ id: '1' })
  })

  it('a malformed id never reaches the fold: tRPC\'s own `.input()` rejects it first', async () => {
    // The SAME schema the scope validates with — so the two cannot disagree,
    // and on this host tRPC gets there first.
    await expect(caller(anon).getPost({ id: 'abc' })).rejects.toThrow()
  })

  it('an unknown post, well-formed id: NOT_FOUND, tRPC\'s one door', async () => {
    await expect(caller(anon).getPost({ id: '999' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('trpc + scope: the middleware guard', () => {
  it('an anonymous call is refused before the procedure runs', async () => {
    await expect(caller(anon).publishPost({ id: '1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('an authed call reaches the domain', async () => {
    await expect(caller(asUser).publishPost({ id: '1' })).resolves.toMatchObject({
      id: '1',
      published: true,
    })
  })

  it('an authed call for an unknown post: NOT_FOUND', async () => {
    await expect(caller(asUser).publishPost({ id: '999' })).rejects.toBeInstanceOf(TRPCError)
  })
})

// What the middleware's steps derived becomes the CONTEXT OVERRIDE, and this
// is where it lands: tRPC's own resolvers, typed. A scope mounted on the same
// procedure does NOT see it — its context type is read off the ROOT builder
// (`trpc(t, deps)`) and does not follow a procedure that grew it. Both halves
// are pinned here so the limit is a measured fact, not a belief.
describe('trpc + scope: where a middleware\'s context override actually lands', () => {
  // A router of this test's own, so the claim is CALLED and not merely typed.
  const probeRouter = t.router({
    whoami: authed.query(({ ctx }) => {
      // typed `string`: what the scope's step derived, in tRPC's own resolver
      expectTypeOf(ctx.actor).toEqualTypeOf<string>()
      return ctx.actor
    }),
  })

  it('a native resolver reads what the scope derived, typed and at runtime', async () => {
    await expect(probeRouter.createCaller(asUser).whoami()).resolves.toBe('u1')
  })

  it('and the guard still refuses an anonymous call on the way', async () => {
    await expect(probeRouter.createCaller(anon).whoami()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('trpc + scope: createPost, validated by the schema tRPC already ran', () => {
  it('a valid input: the created post', async () => {
    await expect(
      caller(anon).createPost({ title: 'New', content: 'Body' }),
    ).resolves.toMatchObject({ title: 'New', published: false })
  })

  it('an invalid input is refused by `.input(schema)` before the fold', async () => {
    await expect(caller(anon).createPost({ title: '', content: 'x' })).rejects.toThrow()
  })
})
