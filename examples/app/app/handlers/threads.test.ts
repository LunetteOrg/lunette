import { isAbort } from '@lntt/scope'
import { describe, expect, it } from 'vitest'
import type { Surface } from '../domain/render.ts'
import type { Comment, CommentForReading, FeedPost, Post, PostForReading } from '../domain/threads.ts'
import { PostNotFound, PostTitleRequired } from '../lib/errors.ts'
import type { ComposeCommentInput } from '../use-cases/threads/compose-comment.ts'
import type { PublishPostInput } from '../use-cases/threads/publish-post.ts'
import { commentsHandler, feedGuard, postGuard, commentHandler, publishHandler, feedHandler } from './threads.ts'
import { aComment, aFeedPost, aPost, aPostRow, aSession } from './fixtures.ts'

// The threads handlers as PURE functions: the guards/leaves are named + typed,
// so each fetch, mapping and error branch is proven directly — no `runScope`,
// no carrier, no fold. The fold that wires them is proven once in @lntt/scope;
// end-to-end composition is proven by the per-host integration + e2e tests.

describe('feed: feedGuard fetches, feedHandler shapes', () => {
  it('feedGuard: fetches the "feed" scope and enriches { feed }', async () => {
    let scope = ''
    const out = await feedGuard({
      threads: {
        listFeed: async (s: string): Promise<FeedPost[]> => {
          scope = s
          return [aFeedPost]
        },
      },
    })
    expect(out).toEqual({ feed: [aFeedPost] })
    expect(scope).toBe('feed')
  })

  it('feedHandler: the feed passes through', () => {
    expect(feedHandler({}, { feed: [aFeedPost] })).toEqual({ feed: [aFeedPost] })
    expect(feedHandler({}, { feed: [] })).toEqual({ feed: [] })
  })
})

describe('postGuard: prefetch guard, hit → { post }, miss → 404', () => {
  it('hit → { post }, viewer id from the session', async () => {
    let viewer: string | undefined = 'unset'
    const out = await postGuard(
      {
        threads: {
          getPostForReading: async (
            _id: string,
            _channel: 'web',
            v?: string,
          ): Promise<PostForReading | PostNotFound> => {
            viewer = v
            return aPost
          },
        },
      },
      { params: { postId: 'p1' }, session: aSession },
    )
    expect(out).toEqual({ post: aPost })
    expect(viewer).toBe('u1')
  })

  it('anonymous hit → { post }, viewer undefined', async () => {
    let viewer: string | undefined = 'unset'
    const out = await postGuard(
      {
        threads: {
          getPostForReading: async (
            _id: string,
            _channel: 'web',
            v?: string,
          ): Promise<PostForReading | PostNotFound> => {
            viewer = v
            return aPost
          },
        },
      },
      { params: { postId: 'p1' }, session: null },
    )
    expect(out).toEqual({ post: aPost })
    expect(viewer).toBeUndefined()
  })

  it('returned PostNotFound → a 404 abort', async () => {
    const out = await postGuard(
      {
        threads: {
          getPostForReading: async (): Promise<PostForReading | PostNotFound> => new PostNotFound(),
        },
      },
      { params: { postId: 'nope' }, session: null },
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 404 })
  })
})

describe('publishHandler: the shared write step, author from the caller', () => {
  it('valid → { post }, author + fields passed through', async () => {
    let seen: PublishPostInput | null = null
    const out = await publishHandler(
      {
        threads: {
          publishPost: async (input: PublishPostInput): Promise<Post> => {
            seen = input
            return { ...aPostRow, title: input.title }
          },
        },
      },
      'u1',
      { title: 'Hi', body: 'world' },
    )
    expect(isAbort(out)).toBe(false)
    if ('post' in out) expect(out.post.title).toBe('Hi')
    expect(seen).toMatchObject({ authorId: 'u1', title: 'Hi', body: 'world', status: 'published' })
  })

  it('returned PostTitleRequired → a 422 abort with the tag as body', async () => {
    const out = await publishHandler(
      {
        threads: {
          publishPost: async (): Promise<Post | PostTitleRequired> => new PostTitleRequired(),
        },
      },
      'u1',
      { title: '', body: 'world' },
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out))
      expect(out.intent).toMatchObject({ kind: 'status', status: 422, body: { error: 'PostTitleRequired' } })
  })
})

describe('commentHandler: the shared comment write, missing post → 404', () => {
  it('valid → { comment }, postId + author + body passed through', async () => {
    let seen: ComposeCommentInput | null = null
    const out = await commentHandler(
      {
        threads: {
          composeComment: async (input: ComposeCommentInput): Promise<Comment> => {
            seen = input
            return aComment
          },
        },
      },
      'p1',
      'u1',
      { body: 'nice' },
    )
    expect(isAbort(out)).toBe(false)
    if ('comment' in out) expect(out.comment).toEqual(aComment)
    expect(seen).toMatchObject({ postId: 'p1', authorId: 'u1', body: 'nice' })
  })

  it('returned PostNotFound → a 404 abort with the tag as body', async () => {
    const out = await commentHandler(
      {
        threads: {
          composeComment: async (): Promise<Comment | PostNotFound> => new PostNotFound(),
        },
      },
      'nope',
      'u1',
      { body: 'nice' },
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out))
      expect(out.intent).toMatchObject({ kind: 'status', status: 404, body: { error: 'PostNotFound' } })
  })
})

describe('commentsHandler: normalises the surface, lists at it', () => {
  it('resolves the surface then lists comments there', async () => {
    const rows: CommentForReading[] = [{ id: 'c1', body: 'a', authorName: 'Ada', authorColor: '#abc' }]
    let surfaceUsed: Surface | null = null
    const out = await commentsHandler(
      {
        profile: {
          resolveSurface: (_raw: string | null | undefined, fallback: Surface): Surface => fallback,
        },
        threads: {
          listCommentsForReading: async (_postId: string, surface: Surface): Promise<CommentForReading[]> => {
            surfaceUsed = surface
            return rows
          },
        },
      },
      { params: { postId: 'p1' } },
    )
    expect(out).toEqual({ comments: rows })
    expect(surfaceUsed).toBe('web')
  })
})
