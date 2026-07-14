import { runScope } from '@lntt/scope'
import type { CookieSink, RequestScope } from '@lntt/scope'
import { describe, expect, it } from 'vitest'
import type { Session, User } from './domain/access.ts'
import type { ProfileIdentity } from './domain/profile.ts'
import type { Surface } from './domain/render.ts'
import type { Comment, CommentForReading, FeedPost, Post, PostForReading } from './domain/threads.ts'
import type { PendingAuth } from './lib/cookies.ts'
import type { ComposeCommentInput } from './use-cases/threads/compose-comment.ts'
import type { PublishPostInput } from './use-cases/threads/publish-post.ts'
import type { VerifyCodeResult } from './use-cases/access/verify-code.ts'
import {
  commentFragment,
  commentsFragment,
  feedFragment,
  identityFragment,
  loginFragment,
  logoutFragment,
  postFragment,
  publishPostFragment,
  setPreferenceFragment,
  verifyFragment,
} from './handlers.ts'
import { OtpInvalid, PostNotFound, PostTitleRequired } from './lib/errors.ts'

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

describe('loginFragment: valid → ok + pending cookie set, invalid → 422 abort', () => {
  // A fake pending cookie whose `apply` writes through the sink — the unit test
  // reads the collected `out.cookies` to prove the pending state was set.
  const pendingCookie = {
    apply: (sink: CookieSink, value: PendingAuth): void =>
      sink.set('pending-auth', `signed:${value.email}:${value.nonce}`, {
        path: '/',
        httpOnly: true,
        maxAge: 900,
      }),
  }

  it('valid email → requestCode runs with a nonce → ok + pending cookie', async () => {
    const called: Array<{ email: string; nonce: string | undefined }> = []
    const app = {
      validateEmail: (email: string): boolean => email.includes('@'),
      generateId: (): string => 'nonce-1',
      access: {
        requestCode: async (email: string, nonce?: string): Promise<void> => {
          called.push({ email, nonce })
        },
      },
      pendingCookie,
    }
    const form = new FormData()
    form.set('email', 'user@example.com')
    const out = await runScope<RequestScope, typeof loginFragment.schema, { ok: true }>(
      loginFragment,
      app,
      { request: new Request('http://x', { method: 'POST', body: form }) },
      {},
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ ok: true })
    expect(out.cookies).toEqual([
      { name: 'pending-auth', value: 'signed:user@example.com:nonce-1', options: { path: '/', httpOnly: true, maxAge: 900 } },
    ])
    expect(called).toEqual([{ email: 'user@example.com', nonce: 'nonce-1' }])
  })

  it('invalid email → 422 abort, requestCode never runs, no cookie', async () => {
    const called: string[] = []
    const app = {
      validateEmail: (email: string): boolean => email.includes('@'),
      generateId: (): string => 'nonce-1',
      access: {
        requestCode: async (email: string): Promise<void> => {
          called.push(email)
        },
      },
      pendingCookie,
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
    expect(out.cookies).toEqual([])
  })
})

// A JSON POST carrier: the write fragments read the body off `ctx.request`.
const jsonPost = (body: unknown): { request: Request } => ({
  request: new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }),
})

const aPostRow: Post = {
  id: 'p1',
  authorId: 'u1',
  title: 'Hi',
  body: 'world',
  origFormat: 'text',
  status: 'published',
  createdAt: new Date('2020-01-01'),
}

describe('publishPostFragment: gated write, domain error → 422', () => {
  it('signed in + valid → { post } with the author from the session', async () => {
    let authorId = ''
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      threads: {
        publishPost: async (input: PublishPostInput): Promise<Post> => {
          authorId = input.authorId
          return { ...aPostRow, title: input.title }
        },
      },
    }
    const out = await runScope<RequestScope, typeof publishPostFragment.schema, { post: Post }>(
      publishPostFragment,
      app,
      jsonPost({ title: 'Hi', body: 'world' }),
      {},
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value.post.title).toBe('Hi')
    expect(authorId).toBe('u1') // the gated session, never the client
  })

  it('anonymous → 401, publishPost never runs', async () => {
    let ran = false
    const app = {
      getSession: async (): Promise<Session | null> => null,
      threads: {
        publishPost: async (): Promise<Post> => {
          ran = true
          return aPostRow
        },
      },
    }
    const out = await runScope<RequestScope, typeof publishPostFragment.schema, { post: Post }>(
      publishPostFragment,
      app,
      jsonPost({ title: 'Hi', body: 'world' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401 })
    expect(ran).toBe(false)
  })

  it('empty title → the returned PostTitleRequired maps to 422', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      threads: {
        publishPost: async (): Promise<Post | PostTitleRequired> => new PostTitleRequired(),
      },
    }
    const out = await runScope<RequestScope, typeof publishPostFragment.schema, { post: Post }>(
      publishPostFragment,
      app,
      jsonPost({ title: '', body: 'world' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok)
      expect(out.abort.intent).toMatchObject({ kind: 'status', status: 422, body: { error: 'PostTitleRequired' } })
  })
})

describe('commentFragment: route param + body, missing post → 404', () => {
  const aComment: Comment = {
    id: 'c1',
    postId: 'p1',
    authorId: 'u1',
    parentId: null,
    body: 'nice',
    origFormat: 'text',
    createdAt: new Date('2020-01-01'),
  }

  it('signed in → composeComment gets postId (param) + author (session)', async () => {
    let seen: ComposeCommentInput | null = null
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      threads: {
        composeComment: async (input: ComposeCommentInput): Promise<Comment> => {
          seen = input
          return aComment
        },
      },
    }
    const out = await runScope<RequestScope, typeof commentFragment.schema, { comment: Comment }>(
      commentFragment,
      app,
      jsonPost({ body: 'nice' }),
      { postId: 'p1' },
    )
    expect(out.ok).toBe(true)
    expect(seen).toMatchObject({ postId: 'p1', authorId: 'u1', body: 'nice' })
  })

  it('missing post → returned PostNotFound maps to 404', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      threads: {
        composeComment: async (): Promise<Comment | PostNotFound> => new PostNotFound(),
      },
    }
    const out = await runScope<RequestScope, typeof commentFragment.schema, { comment: Comment }>(
      commentFragment,
      app,
      jsonPost({ body: 'nice' }),
      { postId: 'nope' },
    )
    expect(out.ok).toBe(false)
    if (!out.ok)
      expect(out.abort.intent).toMatchObject({ kind: 'status', status: 404, body: { error: 'PostNotFound' } })
  })
})

describe('commentsFragment: public read, surface normalised, all-host shape', () => {
  it('lists comments at the resolved surface', async () => {
    const rows: CommentForReading[] = [
      { id: 'c1', body: 'a', authorName: 'Ada', authorColor: '#abc' },
    ]
    let surfaceUsed: Surface | null = null
    const app = {
      profile: {
        resolveSurface: (_raw: string | null | undefined, fallback: Surface): Surface => fallback,
      },
      threads: {
        listCommentsForReading: async (_postId: string, surface: Surface): Promise<CommentForReading[]> => {
          surfaceUsed = surface
          return rows
        },
      },
    }
    const out = await runScope<RequestScope, typeof commentsFragment.schema, { comments: CommentForReading[] }>(
      commentsFragment,
      app,
      { request: new Request('http://x') },
      { postId: 'p1' },
    )
    expect(out).toEqual({ ok: true, value: { comments: rows }, cookies: [] })
    expect(surfaceUsed).toBe('web')
  })
})

describe('identityFragment: gated read, no row → 404', () => {
  const anIdentity: ProfileIdentity = { name: 'Ada', color: '#abc', surfaceOptions: ['web', 'feed', 'email'] }

  it('signed in with a profile → { identity }', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      profile: { getIdentity: async (_id: string): Promise<ProfileIdentity | null> => anIdentity },
    }
    const out = await runScope<RequestScope, typeof identityFragment.schema, { identity: ProfileIdentity }>(
      identityFragment,
      app,
      { request: new Request('http://x') },
      {},
    )
    expect(out).toEqual({ ok: true, value: { identity: anIdentity }, cookies: [] })
  })

  it('anonymous → 401', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => null,
      profile: { getIdentity: async (): Promise<ProfileIdentity | null> => anIdentity },
    }
    const out = await runScope<RequestScope, typeof identityFragment.schema, { identity: ProfileIdentity }>(
      identityFragment,
      app,
      { request: new Request('http://x') },
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401 })
  })

  it('signed in but no profile row → 404', async () => {
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      profile: { getIdentity: async (): Promise<ProfileIdentity | null> => null },
    }
    const out = await runScope<RequestScope, typeof identityFragment.schema, { identity: ProfileIdentity }>(
      identityFragment,
      app,
      { request: new Request('http://x') },
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 404 })
  })
})

describe('setPreferenceFragment: gated write, out-of-range surface falls back', () => {
  const aUser: User = {
    id: 'u1',
    email: 'a@b.c',
    displayName: 'Ada',
    locale: 'feed',
    createdAt: new Date('2020-01-01'),
  }

  it('normalises then writes, returns { locale }', async () => {
    let written: Surface | null = null
    const app = {
      getSession: async (): Promise<Session | null> => aSession,
      profile: {
        resolveSurface: (raw: string | null | undefined, fallback: Surface): Surface =>
          (['web', 'feed', 'email'] as string[]).includes(raw ?? '') ? (raw as Surface) : fallback,
        setPreference: async (_id: string, surface: Surface): Promise<User> => {
          written = surface
          return { ...aUser, locale: surface }
        },
      },
    }
    const out = await runScope<RequestScope, typeof setPreferenceFragment.schema, { locale: string | null }>(
      setPreferenceFragment,
      app,
      jsonPost({ surface: 'bogus' }),
      {},
    )
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.value).toEqual({ locale: 'web' })
    expect(written).toBe('web') // the bogus value normalised to the fallback
  })
})

describe('verifyFragment: no pending → 401, wrong code → 401, ok → redirect + cookies', () => {
  const pending: PendingAuth = { email: 'user@example.com', nonce: 'n1', returnTo: '/home' }

  it('no pending cookie → 401, verifyCode never runs', async () => {
    let ran = false
    const app = {
      pendingCookie: { read: async (): Promise<PendingAuth | null> => null },
      access: {
        verifyCode: async (): Promise<VerifyCodeResult> => {
          ran = true
          return { sessionId: 's1', userId: 'u1', isNewUser: false, locale: null }
        },
      },
      sessionCookie: { apply: (): void => {} },
    }
    const out = await runScope<RequestScope, typeof verifyFragment.schema, never>(
      verifyFragment,
      app,
      jsonPost({ code: '123456' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401 })
    expect(ran).toBe(false)
  })

  it('wrong code → returned OtpInvalid maps to 401, no cookies set', async () => {
    const app = {
      pendingCookie: { read: async (): Promise<PendingAuth | null> => pending, drop: (): void => {} },
      access: { verifyCode: async (): Promise<VerifyCodeResult | OtpInvalid> => new OtpInvalid() },
      sessionCookie: { apply: (): void => {} },
    }
    const out = await runScope<RequestScope, typeof verifyFragment.schema, never>(
      verifyFragment,
      app,
      jsonPost({ code: 'wrong' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'status', status: 401, body: { error: 'OtpInvalid' } })
    expect(out.cookies).toEqual([])
  })

  it('ok → session cookie set, pending dropped, redirect to returnTo', async () => {
    const app = {
      pendingCookie: {
        read: async (): Promise<PendingAuth | null> => pending,
        drop: (sink: CookieSink): void => sink.set('pending-auth', '', { path: '/', maxAge: 0 }),
      },
      access: {
        verifyCode: async (email: string, code: string, nonce?: string): Promise<VerifyCodeResult> => {
          expect(email).toBe('user@example.com')
          expect(nonce).toBe('n1')
          expect(code).toBe('123456')
          return { sessionId: 's1', userId: 'u1', isNewUser: true, locale: null }
        },
      },
      sessionCookie: {
        apply: (sink: CookieSink, id: string): void =>
          sink.set('session', `signed:${id}`, { path: '/', httpOnly: true, maxAge: 60 }),
      },
    }
    const out = await runScope<RequestScope, typeof verifyFragment.schema, never>(
      verifyFragment,
      app,
      jsonPost({ code: '123456' }),
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'redirect', location: '/home' })
    expect(out.cookies).toEqual([
      { name: 'session', value: 'signed:s1', options: { path: '/', httpOnly: true, maxAge: 60 } },
      { name: 'pending-auth', value: '', options: { path: '/', maxAge: 0 } },
    ])
  })
})

describe('logoutFragment: drops the session cookie and redirects', () => {
  it('clears session, redirect /', async () => {
    const app = {
      sessionCookie: {
        drop: (sink: CookieSink): void => sink.set('session', '', { path: '/', httpOnly: true, maxAge: 0 }),
      },
    }
    const out = await runScope<RequestScope, typeof logoutFragment.schema, never>(
      logoutFragment,
      app,
      { request: new Request('http://x', { method: 'POST' }) },
      {},
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.abort.intent).toMatchObject({ kind: 'redirect', location: '/' })
    expect(out.cookies).toEqual([
      { name: 'session', value: '', options: { path: '/', httpOnly: true, maxAge: 0 } },
    ])
  })
})
