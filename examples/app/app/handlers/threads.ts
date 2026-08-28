import { z } from 'zod'
import { notFound } from '@lntt/scope/http'
import * as rpc from '@lntt/scope/trpc'
import type { Session } from '../domain/access.ts'
import type { Surface } from '../domain/render.ts'
import type {
  Comment,
  CommentForReading,
  FeedPost,
  Post,
  PostForReading,
} from '../domain/threads.ts'
import { isError, type PostNotFound, type TaggedError } from '../lib/errors.ts'
import type { ComposeCommentInput } from '../use-cases/threads/compose-comment.ts'
import type { PublishPostInput } from '../use-cases/threads/publish-post.ts'
import { httpAbortFor, rpcAbortFor } from './respond.ts'

// PROTOTYPE — the feed handler as PURE, named functions, so each is unit-tested
// in isolation (typed, no carrier, no fold, no fake session to satisfy a gate).
// The scope that wires them lives in ../handlers.ts.

// The feed fetch — a guard: declares only the slice of the app it calls
// (`threads.listFeed`), returns the enrichment `{ feed }`. It ignores the ctx,
// never aborts, so it needs no per-carrier twin.
export const feedGuard = (deps: {
  threads: { listFeed(scope: string): Promise<FeedPost[]> }
}): Promise<{ feed: FeedPost[] }> => deps.threads.listFeed('feed').then((feed) => ({ feed }))

// The response shaping — a leaf: no deps, reads only the accumulated feed from
// `feedGuard`. A plain function of its ctx.
export const feedHandler = (
  _deps: Record<never, never>,
  ctx: { feed: FeedPost[] },
): { feed: FeedPost[] } => ({
  feed: ctx.feed,
})

// The post prefetch — a guard: declares only `threads.getPostForReading`, and
// either enriches `{ post }` or ABORTS with `notFound()` — a RETURNED value, not
// the raw `throw new Response(null, { status: 404 })`. The viewer id flows from
// the prior guard's enrichment (`ctx.session`), typed, no re-read.
//
// NO `: … | Abort` return annotation — see `guards.ts`'s `authGuard` for why.
export const postGuard = (
  deps: {
    threads: {
      getPostForReading(
        id: string,
        channel: 'web',
        viewer?: string,
      ): Promise<PostForReading | PostNotFound>
    }
  },
  ctx: { params: { postId: string }; session: Session | null },
) =>
  deps.threads
    .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
    .then((post) => (isError(post) ? notFound() : { post }))

// The tRPC-mounted twin: same prefetch, tRPC's own `notFound()`.
export const postGuardRpc = (
  deps: {
    threads: {
      getPostForReading(
        id: string,
        channel: 'web',
        viewer?: string,
      ): Promise<PostForReading | PostNotFound>
    }
  },
  ctx: { params: { postId: string }; session: Session | null },
) =>
  deps.threads
    .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
    .then((post) => (isError(post) ? rpc.notFound() : { post }))

// The trivial shape leaf behind the post loader: no deps, reads only the post
// the prefetch guard accumulated. Named so the scope stays declarative. Never
// aborts, so it needs no per-carrier twin — reused unchanged by both wirings.
export const postHandler = (
  _deps: Record<never, never>,
  ctx: { post: PostForReading },
): { post: PostForReading } => ({ post: ctx.post })

// ── write path: the wide composition node behind POST /posts ────────────────
// The leaf declares only `threads.publishPost` (a bound leaf on the app: deps
// fixed, called with the input). publishPost is a 7-dep node — validate, upload
// inline images (blobs), detect format, create the post, warm the render cache
// — but the scope sees ONE function. Body fields come off the request (the
// hosts stream it in); the author is the gated session, never the client.
// The shared write step: the SAME domain call, fed by whichever input channel
// the host uses — `.body` on the HTTP hosts, the `.input` payload on tRPC. The
// two wirings differ only in where the fields come from (`ctx.body` vs
// `ctx.params`), and — since a domain error's outcome is carrier vocabulary —
// each carrier family gets its own thin translation (`httpAbortFor` /
// `rpcAbortFor`); the fetch itself is identical.
// The `.body` schema is the source of truth for the optional-field type: the
// hand-written `PublishFields` is DERIVED from it via `z.infer`, so a schema
// tweak can never drift from the type the step consumes.
export const publishBody = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
})
export type PublishFields = z.infer<typeof publishBody>
export type PublishDeps = {
  threads: { publishPost(input: PublishPostInput): Promise<Post | TaggedError> }
}
export const publishHandler = (deps: PublishDeps, authorId: string, fields: PublishFields) =>
  deps.threads
    .publishPost({
      authorId,
      title: fields.title ?? '',
      body: fields.body ?? '',
      status: fields.status ?? 'published',
    })
    .then((result) => (isError(result) ? httpAbortFor(result) : { post: result }))

export const publishHandlerRpc = (deps: PublishDeps, authorId: string, fields: PublishFields) =>
  deps.threads
    .publishPost({
      authorId,
      title: fields.title ?? '',
      body: fields.body ?? '',
      status: fields.status ?? 'published',
    })
    .then((result) => (isError(result) ? rpcAbortFor(result) : { post: result }))

// ── write path: POST /posts/:postId/comments ────────────────────────────────
// The gated-with-input base fixes the ROUTE param (`postId`); the body carries
// the comment. composeComment prefetches the post/parent itself and RETURNS
// PostNotFound / ParentCommentNotFound — mapped to 404 — or CommentBodyRequired
// → 422. As with publish, `CommentFields` is DERIVED from the `.body` schema.
export const commentBody = z.object({ body: z.string().optional(), parentId: z.string().optional() })
export type CommentFields = z.infer<typeof commentBody>
export type CommentDeps = {
  threads: { composeComment(input: ComposeCommentInput): Promise<Comment | TaggedError> }
}
export const commentHandler = (
  deps: CommentDeps,
  postId: string,
  authorId: string,
  fields: CommentFields,
) =>
  deps.threads
    .composeComment({
      postId,
      authorId,
      body: fields.body ?? '',
      ...(fields.parentId !== undefined && { parentId: fields.parentId }),
    })
    .then((result) => (isError(result) ? httpAbortFor(result) : { comment: result }))

export const commentHandlerRpc = (
  deps: CommentDeps,
  postId: string,
  authorId: string,
  fields: CommentFields,
) =>
  deps.threads
    .composeComment({
      postId,
      authorId,
      body: fields.body ?? '',
      ...(fields.parentId !== undefined && { parentId: fields.parentId }),
    })
    .then((result) => (isError(result) ? rpcAbortFor(result) : { comment: result }))

// ── read path: GET /posts/:postId/comments (all four hosts) ──────────────────
// The comments read — a leaf: normalises the surface through the degenerate
// empty-deps leaf (`resolveSurface`), then lists at that surface (the composed
// read `listCommentsForReading` fans out render + authors). Named + typed, so
// the surface normalisation and the listing are proven without the fold. Never
// aborts, so it needs no per-carrier twin.
export const commentsHandler = async (
  deps: {
    profile: { resolveSurface(raw: string | null | undefined, fallback: Surface): Surface }
    threads: {
      listCommentsForReading(postId: string, surface: Surface): Promise<CommentForReading[]>
    }
  },
  ctx: { params: { postId: string } },
): Promise<{ comments: CommentForReading[] }> => {
  const surface = deps.profile.resolveSurface(undefined, 'web')
  const comments = await deps.threads.listCommentsForReading(ctx.params.postId, surface)
  return { comments }
}
