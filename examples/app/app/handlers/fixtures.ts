// Shared fixtures for the colocated handler tests. NOT a test file — the pure
// tests in each `handlers/*.test.ts` import the domain rows they need from here,
// so a shape tweak lands in one place. `jsonPost` builds a POST carrier for the
// (few) tests that still drive a scope through the fold (verify).

import type { Session, User } from '../domain/access.ts'
import type { ProfileIdentity } from '../domain/profile.ts'
import type { Comment, FeedPost, Post, PostForReading } from '../domain/threads.ts'

export const aSession: Session = {
  id: 's1',
  userId: 'u1',
  expiresAt: new Date(Date.now() + 60_000),
}

export const aFeedPost: FeedPost = {
  id: 'p1',
  title: 'Hello',
  excerpt: 'world',
  authorName: 'Ada',
  authorColor: '#abc',
  commentCount: 0,
}

export const aPost: PostForReading = {
  id: 'p1',
  title: 'Hello',
  body: 'world',
  authorName: 'Ada',
  authorColor: '#abc',
  surface: 'web',
}

export const aPostRow: Post = {
  id: 'p1',
  authorId: 'u1',
  title: 'Hi',
  body: 'world',
  origFormat: 'text',
  status: 'published',
  createdAt: new Date('2020-01-01'),
}

export const aComment: Comment = {
  id: 'c1',
  postId: 'p1',
  authorId: 'u1',
  parentId: null,
  body: 'nice',
  origFormat: 'text',
  createdAt: new Date('2020-01-01'),
}

export const aUser: User = {
  id: 'u1',
  email: 'a@b.c',
  displayName: 'Ada',
  locale: 'web',
  createdAt: new Date('2020-01-01'),
}

export const anIdentity: ProfileIdentity = {
  name: 'Ada',
  color: '#abc',
  surfaceOptions: ['web', 'feed', 'email'],
}

// A JSON POST carrier: the write scopes read the body off `ctx.request`.
export const jsonPost = (body: unknown): { request: Request } => ({
  request: new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }),
})
