import { runScope } from '@lntt/scope'
import type { RequestScope } from '@lntt/scope'
import { describe, expect, it } from 'vitest'
import type { Session } from './domain/access.ts'
import type { FeedPost, PostForReading } from './domain/threads.ts'
import { feedFragment, loginFragment, postFragment } from './handlers.ts'
import { PostNotFound } from './lib/errors.ts'

// A fragment is a testable UNIT: no host, no chain, no database. Each test
// drives one fragment through `runScope` with PLAIN FAKE deps — the exact
// function shapes the guards declare. `runScope` hands the same `app` object to
// every guard and the leaf, so a fake carries only the methods that fragment
// touches. We assert the host-agnostic `Outcome` shape (`ok`/`value` or
// `ok`/`abort`), never a `Response`.

const carrier = { request: new Request('http://x') }

const aSession: Session = {
  id: 's1',
  userId: 'u1',
  expiresAt: new Date(Date.now() + 60_000),
}

const aFeedPost: FeedPost = {
  id: 'p1',
  title: 'Hello',
  excerpt: 'world',
  authorName: 'Ada',
  authorColor: '#abc',
  commentCount: 0,
}

const aPost: PostForReading = {
  id: 'p1',
  title: 'Hello',
  body: 'world',
  authorName: 'Ada',
  authorColor: '#abc',
  surface: 'web',
}

describe('feedFragment: signed-in vs anonymous, no session re-read', () => {
  it('signed in → signedIn true, feed shaped from the guard', async () => {
    const app = {
      getSession: async (_request: Request): Promise<Session | null> => aSession,
      threads: { listFeed: async (_scope: string): Promise<FeedPost[]> => [aFeedPost] },
    }
    const out = await runScope<RequestScope, typeof feedFragment.schema, {
      signedIn: boolean
      feed: FeedPost[]
    }>(feedFragment, app, carrier, {})
    expect(out).toEqual({ ok: true, value: { signedIn: true, feed: [aFeedPost] }, cookies: [] })
  })

  it('anonymous → signedIn false, empty feed', async () => {
    const app = {
      getSession: async (_request: Request): Promise<Session | null> => null,
      threads: { listFeed: async (_scope: string): Promise<FeedPost[]> => [] },
    }
    const out = await runScope<RequestScope, typeof feedFragment.schema, {
      signedIn: boolean
      feed: FeedPost[]
    }>(feedFragment, app, carrier, {})
    expect(out).toEqual({ ok: true, value: { signedIn: false, feed: [] }, cookies: [] })
  })
})

describe('postFragment: found → post, missing → returned 404 abort', () => {
  it('found → the leaf shapes { post }', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => null,
      threads: {
        getPostForReading: async (
          _id: string,
          _channel: 'web',
          _viewer?: string,
        ): Promise<PostForReading | PostNotFound> => aPost,
      },
    }
    const out = await runScope<RequestScope, typeof postFragment.schema, { post: PostForReading }>(
      postFragment,
      app,
      carrier,
      { postId: 'p1' },
    )
    expect(out).toEqual({ ok: true, value: { post: aPost }, cookies: [] })
  })

  it('missing → a RETURNED 404 abort, the leaf never runs', async () => {
    let leafRan = false
    const app = {
      getSession: async (): Promise<Session | null> => null,
      threads: {
        getPostForReading: async (): Promise<PostForReading | PostNotFound> => new PostNotFound(),
      },
    }
    const out = await runScope<RequestScope, typeof postFragment.schema, { post: PostForReading }>(
      { ...postFragment, leaf: (...args) => (leafRan = true, postFragment.leaf(...args)) },
      app,
      carrier,
      { postId: 'nope' },
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 404 })
    expect(leafRan).toBe(false)
  })
})

describe('loginFragment: valid → ok, invalid → returned 422 abort', () => {
  it('valid email → requestCode runs → ok', async () => {
    const called: string[] = []
    const app = {
      validateEmail: (email: string): boolean => email.includes('@'),
      access: {
        requestCode: async (email: string): Promise<void> => {
          called.push(email)
        },
      },
    }
    const form = new FormData()
    form.set('email', 'user@example.com')
    const out = await runScope<RequestScope, typeof loginFragment.schema, { ok: true }>(
      loginFragment,
      app,
      { request: new Request('http://x', { method: 'POST', body: form }) },
      {},
    )
    expect(out).toEqual({ ok: true, value: { ok: true }, cookies: [] })
    expect(called).toEqual(['user@example.com'])
  })

  it('invalid email → 422 abort, requestCode never runs', async () => {
    const called: string[] = []
    const app = {
      validateEmail: (email: string): boolean => email.includes('@'),
      access: {
        requestCode: async (email: string): Promise<void> => {
          called.push(email)
        },
      },
    }
    const form = new FormData()
    form.set('email', 'not-an-email')
    const out = await runScope<RequestScope, typeof loginFragment.schema, { ok: true }>(
      loginFragment,
      app,
      { request: new Request('http://x', { method: 'POST', body: form }) },
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 422, body: { error: 'invalid-email' } })
    expect(called).toEqual([])
  })
})
