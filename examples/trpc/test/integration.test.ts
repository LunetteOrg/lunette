import { describe, expect, it } from 'vitest'
import { parseEnv } from '@lntt/example-app'
import { chain, createCaller } from '../src/router.ts'

// Integration test: the real example app mounted as a tRPC router, driven
// through a typed server-side caller. The built app singletons + a request are
// the tRPC context; the fold runs inside each procedure's resolver.
describe('example-app on tRPC — integration', () => {
  it('drives feed / post through a typed caller against the real chain', async () => {
    const { app, dispose } = await chain.build({ env: parseEnv({}) })
    const caller = createCaller({ ...app, request: new Request('http://x/') })

    // feed: no input, anonymous by default → empty feed
    const feed = await caller.feed({})
    expect(feed).toEqual({ signedIn: false, feed: [] })

    // post: an unknown id aborts NOT_FOUND (a returned domain abort → TRPCError)
    await expect(caller.post({ postId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    // comments: a read with a route-shaped input, empty for an unknown post
    expect(await caller.comments({ postId: 'nope' })).toEqual({ comments: [] })

    // me: the session gate → a returned unauthorized abort becomes UNAUTHORIZED
    await expect(caller.me({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // publishPost: the dedicated tRPC WRITE path (a mutation). Anonymous →
    // UNAUTHORIZED (the shared auth guards run on tRPC too, reading the session
    // cookie off the request headers). Its input is the RPC payload, not a body.
    await expect(caller.publishPost({ title: 'Hi', body: 'world' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(caller.comment({ postId: 'p1', body: 'hi' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(caller.setPreference({ surface: 'web' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    await dispose()
  })
})
