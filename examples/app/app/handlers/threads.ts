import { z } from 'zod'
import { type Abort, fragment, notFound } from '@lntt/scope'
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
import { abortFor } from './respond.ts'
import { gated, gatedWith, sessionGuard } from './guards.ts'

// PROTOTYPE — the feed handler as PURE, named functions, so each is unit-tested
// in isolation (typed, no carrier, no fold, no fake session to satisfy a gate).
// The fragment below is then just declarative WIRING over them.

// The feed fetch — a guard: declares only the slice of the app it calls
// (`threads.listFeed`), returns the enrichment `{ feed }`. It ignores the ctx.
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

// The fragment is now one declarative line: guard + leaf, each a named pure
// function. The feed is an anonymous read — it needs no session at all, so it
// composes the fetch guard directly, no session guard.
export const feedFragment = fragment().guard(feedGuard).handle(feedHandler)

// The post prefetch — a guard: declares only `threads.getPostForReading`, and
// either enriches `{ post }` or ABORTS with `notFound()` — a RETURNED value, not
// the raw `throw new Response(null, { status: 404 })`. The viewer id flows from
// the prior guard's enrichment (`ctx.session`), typed, no re-read.
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
): Promise<{ post: PostForReading } | Abort> =>
  deps.threads
    .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
    .then((post) => (isError(post) ? notFound() : { post }))

// The post loader as a fragment. The shared session read again (anonymous is
// allowed, so NOT the gate); then the prefetch guard; then a trivial shape leaf
// (`{ post }`) that stays inline — no logic to unit-test.
export const postFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .guard(sessionGuard)
  .guard(postGuard)
  .handle((_deps: {}, ctx) => ({ post: ctx.post }))

// ── write path: the wide composition node behind POST /posts ────────────────
// The leaf declares only `threads.publishPost` (a bound leaf on the app: deps
// fixed, called with the input). publishPost is a 7-dep node — validate, upload
// inline images (blobs), detect format, create the post, warm the render cache
// — but the fragment sees ONE function. Body fields come off the request (the
// hosts stream it in); the author is the gated session, never the client.
// The shared write step: the SAME domain call + error mapping, fed by whichever
// input channel the host uses — `.body` on the HTTP hosts, the `.input` payload
// on tRPC. The two authorings below differ ONLY in where the fields come from
// (`ctx.body` vs `ctx.params`); the guards and this step are shared, so the use
// case lives once.
// The `.body` schema is the source of truth for the optional-field type: the
// hand-written `PublishFields` is DERIVED from it via `z.infer`, so a schema
// tweak can never drift from the type the step consumes.
const publishBody = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
})
export type PublishFields = z.infer<typeof publishBody>
export type PublishDeps = {
  threads: { publishPost(input: PublishPostInput): Promise<Post | TaggedError> }
}
export const publishHandler = (
  deps: PublishDeps,
  authorId: string,
  fields: PublishFields,
): Promise<{ post: Post } | Abort> =>
  deps.threads
    .publishPost({
      authorId,
      title: fields.title ?? '',
      body: fields.body ?? '',
      status: fields.status ?? 'published',
    })
    .then((result) => (isError(result) ? abortFor(result) : { post: result }))

export const publishPostFragment = gated()
  // `.body` = the JSON body channel: validated onto `ctx.body`, HTTP-only.
  .body(publishBody)
  .handle((deps: PublishDeps, ctx) => publishHandler(deps, ctx.session.userId, ctx.body))

// The tRPC-shaped write: the SAME use case as publishPostFragment, authored for
// RPC. Its whole input is the payload (`.input`, not `.body`), so it carries NO
// `body` capability and mounts on tRPC — as a MUTATION — while the auth guards
// (which read only headers, so they work on tRPC too) and `publishHandler` are
// shared. The gated-with-input base fixes the payload FIRST, then the gate.
// Mounted with `toMutation`; the HTTP hosts keep the `.body` variant. Required
// payload fields are assignable to the optional `PublishFields` the step reads.
export const publishPostProcedure = gatedWith(
  z.object({
    title: z.string(),
    body: z.string(),
    status: z.enum(['draft', 'published']).optional(),
  }),
).handle((deps: PublishDeps, ctx) => publishHandler(deps, ctx.session.userId, ctx.params))

// ── write path: POST /posts/:postId/comments ────────────────────────────────
// The gated-with-input base fixes the ROUTE param (`postId`); the body carries
// the comment. composeComment prefetches the post/parent itself and RETURNS
// PostNotFound / ParentCommentNotFound — mapped to 404 — or CommentBodyRequired
// → 422. As with publish, `CommentFields` is DERIVED from the `.body` schema.
const commentBody = z.object({ body: z.string().optional(), parentId: z.string().optional() })
export type CommentFields = z.infer<typeof commentBody>
export type CommentDeps = {
  threads: { composeComment(input: ComposeCommentInput): Promise<Comment | TaggedError> }
}
export const commentHandler = (
  deps: CommentDeps,
  postId: string,
  authorId: string,
  fields: CommentFields,
): Promise<{ comment: Comment } | Abort> =>
  deps.threads
    .composeComment({
      postId,
      authorId,
      body: fields.body ?? '',
      ...(fields.parentId !== undefined && { parentId: fields.parentId }),
    })
    .then((result) => (isError(result) ? abortFor(result) : { comment: result }))

export const commentFragment = gatedWith(z.object({ postId: z.string() })) // the ROUTE param
  .body(commentBody) // the JSON body
  .handle((deps: CommentDeps, ctx) =>
    commentHandler(deps, ctx.params.postId, ctx.session.userId, ctx.body),
  )

// The tRPC-shaped comment write: postId + body + parentId all ride the RPC
// payload (`.input`), so it clears the capability gate and mounts as a mutation.
export const commentProcedure = gatedWith(
  z.object({
    postId: z.string(),
    body: z.string(),
    parentId: z.string().optional(),
  }),
).handle((deps: CommentDeps, ctx) =>
  commentHandler(deps, ctx.params.postId, ctx.session.userId, ctx.params),
)

// ── read path: GET /posts/:postId/comments (all four hosts) ──────────────────
// The comments read — a leaf: normalises the surface through the degenerate
// empty-deps leaf (`resolveSurface`), then lists at that surface (the composed
// read `listCommentsForReading` fans out render + authors). Named + typed, so
// the surface normalisation and the listing are proven without the fold.
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

// Public read, one route param, no body — so it also mounts on tRPC (input =
// the RPC payload `{ postId }`). Thin wiring over `commentsHandler`.
export const commentsFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .handle(commentsHandler)
