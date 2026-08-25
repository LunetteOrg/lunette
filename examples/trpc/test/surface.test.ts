import { describe, expect, it } from 'vitest'
import { createCaller } from '../src/router.ts'
import { createContext, dispose } from '../src/bootstrap/index.ts'

// The mounted SURFACE, one call at a time: every procedure answers with the
// shape its scope promises, driven through a typed server-side caller. The
// built app singletons + a request are the tRPC context; the fold runs inside
// each procedure's resolver. What it proves is the MOUNT, so the stack under it
// is the real one, and the context comes from the composition root on the
// default environment — the same path a served router would take.
//
// Not an integration test in the isolate-one-component sense: the thing under
// test here only exists between a host and a chain, so both have to be real.
// Those tests live where a component CAN be isolated — the adapter against a
// fixture chain in `packages/integration/test`, PGlite on its own in
// `examples/app/app/db`, the chain with only its transport faked in
// `examples/app/app/bootstrap/chain.test.ts`.
//
// Its sibling `e2e.test.ts` differs in what it asks: a JOURNEY (sign-in out of
// band, then an authenticated mutation) rather than each call judged on its own.
describe('example-app on tRPC — the mounted surface', () => {
  it('drives feed / post through a typed caller against the real chain', async () => {
    const caller = createCaller(await createContext(new Request('http://x/')))

    // feed: no input, anonymous by default → empty feed
    const feed = await caller.feed({})
    expect(feed).toEqual({ feed: [] })

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
