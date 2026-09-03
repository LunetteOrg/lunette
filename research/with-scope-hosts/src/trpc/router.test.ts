import { describe, expect, it } from 'vitest'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, type Context } from './router.ts'

const caller = (ctx: Context) => appRouter.createCaller(ctx)

describe('trpc + scope: a domain "not found" — the same one door, composed', () => {
  it('a known post: resolves', async () => {
    const result = await caller({ actorId: undefined }).getPost({ id: '1' })
    expect(result).toMatchObject({ id: '1' })
  })

  it('an unknown post: throws TRPCError NOT_FOUND', async () => {
    await expect(caller({ actorId: undefined }).getPost({ id: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('trpc + scope: the SHARED guard, composed rather than hand-written', () => {
  it('no actorId in context: throws UNAUTHORIZED, from requireActor', async () => {
    await expect(caller({ actorId: undefined }).publishPost({ id: '1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('unknown post, authed: throws NOT_FOUND', async () => {
    await expect(caller({ actorId: 'u1' }).publishPost({ id: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('a known post, authed: resolves with the published post', async () => {
    const result = await caller({ actorId: 'u1' }).publishPost({ id: '1' })
    expect(result).toMatchObject({ id: '1', published: true })
  })
})

describe('trpc + scope: no hand-rolled validation — `.input()` is still the read AND the check', () => {
  it('a valid input: creates the post', async () => {
    const post = await caller({ actorId: undefined }).createPost({ title: 'New', content: 'Body' })
    expect(post).toMatchObject({ title: 'New', content: 'Body' })
  })

  it('an invalid input: rejected before the scope ever runs, by .input() itself', async () => {
    await expect(caller({ actorId: undefined }).createPost({ title: '' } as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('malformed JSON over real HTTP: 400 from the adapter itself, no app code involved', async () => {
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request('http://localhost/trpc/createPost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
      router: appRouter,
      createContext: () => ({ actorId: undefined }),
    })
    expect(res.status).toBe(400)
  })
})
