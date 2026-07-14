import { z } from 'zod'
import type { Session, User, UserRegistration } from './domain/access.ts'
import type { ProfileIdentity } from './domain/profile.ts'
import type { Surface } from './domain/render.ts'
import type {
  Comment,
  CommentForReading,
  FeedPost,
  Post,
  PostForReading,
} from './domain/threads.ts'
import type { PendingAuth, PendingCookie, SessionCookie } from './lib/cookies.ts'
import { isError, type PostNotFound, type TaggedError } from './lib/errors.ts'
import type { ComposeCommentInput } from './use-cases/threads/compose-comment.ts'
import type { PublishPostInput } from './use-cases/threads/publish-post.ts'
import type { VerifyCodeResult } from './use-cases/access/verify-code.ts'
// The scope runtime ships as @lntt/scope (host-agnostic) plus @lntt/integration
// (per-host adapters). This example exposes its use cases as fragments; the
// per-host wiring (build-once + mount + to*) lives in the separate entry
// packages (e.g. examples/rr7), which import these fragments unchanged.
import { type Abort, fragment, httpError, notFound, redirect, unauthorized } from '@lntt/scope'
import type { RequestHead, RequestScope } from '@lntt/scope'

// Domain outcomes are RETURNED tagged errors; the codec only knows HTTP status.
// This one table is where a domain error's HTTP meaning lives for the handlers
// — a 422 for a validation reject, a 404 for a missing prefetch, a 401/429 for
// the auth outcomes. An unlisted tag degrades to 422 (a client-correctable
// input problem), never a 200.
const STATUS_BY_TAG: Record<string, number> = {
  PostTitleRequired: 422,
  PostBodyRequired: 422,
  CommentBodyRequired: 422,
  BodyImageRejected: 422,
  PostNotFound: 404,
  ParentCommentNotFound: 404,
  OtpInvalid: 401,
  OtpExpired: 401,
  OtpMaxAttemptsExceeded: 429,
  RegistrationRequired: 422,
}

// A RETURNED domain error → the matching status abort, its `_tag` as the body
// so the typed client can branch on the reason.
const abortFor = (error: TaggedError): Abort =>
  httpError(STATUS_BY_TAG[error._tag] ?? 422, { error: error._tag })

// Each guard declares its OWN dependencies as an explicit, self-contained
// structural type — the exact function shapes it calls, NOT a `Pick` from the
// whole `App`. A handler thus knows only the slice of the world it touches;
// the structural type still reconciles against the chain's Pub at the adapter
// (DepGuard) in the entry package, so a guard reaching for a repo the chain
// does not expose is a compile error there, on the argument.

// The session read that a hand-rolled loader would repeat — `const session =
// await context.app.getSession(request)` at the top of every loader/action —
// is ONE reusable guard here. It declares only `getSession`, reads the request
// off the carrier, and enriches the bag with `{ session }`. Every fragment
// below opens with it; none rewrites the session read.
const readSession = (
  deps: { getSession: (request: RequestHead) => Promise<Session | null> },
  ctx: { request: RequestHead },
): Promise<{ session: Session | null }> =>
  deps.getSession(ctx.request).then((session) => ({ session }))

// The feed loader as a fragment. The session read is the shared guard; the
// feed fetch is a second guard declaring only `threads.listFeed` (the leaf
// never sees the app, so app access lives in guards and the leaf only SHAPES
// the response). No `context.app.` ceremony in the route body.
export const feedFragment = fragment()
  .guard(readSession)
  .guard(
    (
      deps: { threads: { listFeed(scope: string): Promise<FeedPost[]> } },
      _ctx,
    ) => deps.threads.listFeed('feed').then((feed) => ({ feed })),
  )
  .handle((_deps: {}, ctx) => ({ signedIn: ctx.session !== null, feed: ctx.feed }))

// The post loader as a fragment. The shared session guard again; then a
// prefetch guard declaring only `threads.getPostForReading` that either
// enriches `{ post }` or ABORTS with `notFound()` — a RETURNED value, not the
// raw `throw new Response(null, { status: 404 })`. The viewer id flows from the
// prior guard's enrichment (`ctx.session`), typed, no re-read.
export const postFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .guard(readSession)
  .guard(
    (
      deps: {
        threads: {
          getPostForReading(
            id: string,
            channel: 'web',
            viewer?: string,
          ): Promise<PostForReading | PostNotFound>
        }
      },
      ctx,
    ) =>
      deps.threads
        .getPostForReading(ctx.params.postId, 'web', ctx.session?.userId)
        .then((post) => (isError(post) ? notFound() : { post })),
  )
  .handle((_deps: {}, ctx) => ({ post: ctx.post }))

// The login action as a fragment. One guard owns the whole side-effecting path
// (parse the form, validate, request the code); it declares only the two
// functions it calls (`validateEmail`, `access.requestCode`). The leaf is a
// pure success shape. The invalid-email branch is a returned `httpError(422, …)`
// abort: the scope model maps a validation failure to a 4xx rather than a 200
// domain body.
export const loginFragment = fragment()
  // `.form` = the multipart/urlencoded body channel (design A): the validated
  // form lands on `ctx.form`, and the fragment carries the `body` capability, so
  // it mounts on the HTTP hosts but NOT on tRPC (compile-gated).
  .form(z.object({ email: z.string() }))
  .guard(
    async (
      deps: {
        validateEmail(email: string): boolean
        generateId(): string
        access: { requestCode(email: string, nonce?: string): Promise<void> }
        pendingCookie: Pick<PendingCookie, 'apply'>
      },
      ctx,
    ) => {
      const email = ctx.form.email
      if (!deps.validateEmail(email)) return httpError(422, { error: 'invalid-email' as const })
      // A fresh anti-replay nonce ties this request to the code the verify step
      // checks; it rides the signed pending cookie, not the response body.
      const nonce = deps.generateId()
      await deps.access.requestCode(email, nonce)
      deps.pendingCookie.apply(ctx.cookies, { email, nonce })
      return {}
    },
  )
  .handle(() => ({ ok: true as const }))

// The session gate every authenticated action shares: `readSession` enriches
// `{ session }` (possibly null); `requireSession` narrows it to a present
// `Session` or short-circuits with a 401. Splitting the two keeps the read
// reusable by anonymous-friendly loaders (the feed) AND by gated ones.
// Deps typed as `Record<never, never>` (empty, NO index signature) — NOT
// `Record<string, never>`, whose `{ [k: string]: never }` index signature would
// intersect into the fragment's `Need` and collapse every real dep to `never`,
// making the chain's Pub unable to satisfy it (a silent adapter-side break).
const requireSession = (
  _deps: Record<never, never>,
  ctx: { session: Session | null },
): { session: Session } | Abort => (ctx.session ? { session: ctx.session } : unauthorized())

// ── write path: the wide composition node behind POST /posts ────────────────
// The leaf declares only `threads.publishPost` (a bound leaf on the app: deps
// fixed, called with the input). publishPost is a 7-dep node — validate, upload
// inline images (blobs), detect format, create the post, warm the render cache
// — but the fragment sees ONE function. Body fields come off the request (the
// hosts stream it in); the author is the gated session, never the client.
export const publishPostFragment = fragment()
  // `.body` = the JSON body channel: validated onto `ctx.body`, HTTP-only.
  .body(
    z.object({
      title: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(['draft', 'published']).optional(),
    }),
  )
  .guard(readSession)
  .guard(requireSession)
  .handle(
    async (
      deps: { threads: { publishPost(input: PublishPostInput): Promise<Post | TaggedError> } },
      ctx,
    ) => {
      const result = await deps.threads.publishPost({
        authorId: ctx.session.userId,
        title: ctx.body.title ?? '',
        body: ctx.body.body ?? '',
        status: ctx.body.status ?? 'published',
      })
      return isError(result) ? abortFor(result) : { post: result }
    },
  )

// ── write path: POST /posts/:postId/comments ────────────────────────────────
// `.input` fixes the ROUTE param (`postId`); the body carries the comment.
// composeComment prefetches the post/parent itself and RETURNS PostNotFound /
// ParentCommentNotFound — mapped to 404 — or CommentBodyRequired → 422.
export const commentFragment = fragment()
  .input(z.object({ postId: z.string() })) // the ROUTE param
  .body(z.object({ body: z.string().optional(), parentId: z.string().optional() })) // the JSON body
  .guard(readSession)
  .guard(requireSession)
  .handle(
    async (
      deps: {
        threads: { composeComment(input: ComposeCommentInput): Promise<Comment | TaggedError> }
      },
      ctx,
    ) => {
      const result = await deps.threads.composeComment({
        postId: ctx.params.postId,
        authorId: ctx.session.userId,
        body: ctx.body.body ?? '',
        ...(ctx.body.parentId !== undefined && { parentId: ctx.body.parentId }),
      })
      return isError(result) ? abortFor(result) : { comment: result }
    },
  )

// ── read path: GET /posts/:postId/comments (all four hosts) ──────────────────
// Public read, one route param, no body — so it also mounts on tRPC (input =
// the RPC payload `{ postId }`). Exercises the composed read leaf
// (`listCommentsForReading` fans out render + authors) and the degenerate
// empty-deps leaf (`resolveSurface`) that normalises the surface.
export const commentsFragment = fragment()
  .input(z.object({ postId: z.string() }))
  .handle(
    async (
      deps: {
        profile: { resolveSurface(raw: string | null | undefined, fallback: Surface): Surface }
        threads: {
          listCommentsForReading(postId: string, surface: Surface): Promise<CommentForReading[]>
        }
      },
      ctx,
    ) => {
      const surface = deps.profile.resolveSurface(undefined, 'web')
      const comments = await deps.threads.listCommentsForReading(ctx.params.postId, surface)
      return { comments }
    },
  )

// ── read path: GET /me (gated) ──────────────────────────────────────────────
// No input, no body: mounts on all four hosts. The session gate makes it 401
// when anonymous; a signed-in viewer with no profile row is a 404.
export const identityFragment = fragment()
  .guard(readSession)
  .guard(requireSession)
  .handle(
    async (
      deps: { profile: { getIdentity(userId: string): Promise<ProfileIdentity | null> } },
      ctx,
    ) => {
      const identity = await deps.profile.getIdentity(ctx.session.userId)
      return identity ? { identity } : notFound()
    },
  )

// ── write path: POST /me/preference (gated) ─────────────────────────────────
// The body's raw surface is normalised through the empty-deps leaf before the
// write, so an out-of-range value falls back rather than reaching the repo.
export const setPreferenceFragment = fragment()
  .body(z.object({ surface: z.string().optional() }))
  .guard(readSession)
  .guard(requireSession)
  .handle(
    async (
      deps: {
        profile: {
          resolveSurface(raw: string | null | undefined, fallback: Surface): Surface
          setPreference(userId: string, surface: Surface): Promise<User>
        }
      },
      ctx,
    ) => {
      const surface = deps.profile.resolveSurface(ctx.body.surface, 'web')
      const user = await deps.profile.setPreference(ctx.session.userId, surface)
      return { locale: user.locale }
    },
  )

// ── auth: POST /verify — the transaction-window path + cookie set + redirect ─
// `readPending` reads the signed pending cookie login set (email + nonce +
// optional registration); no cookie → 401. The leaf calls the SHOWCASE windowed
// leaf `access.verifyCode` (a fresh tx per call inside the module): a wrong code
// RETURNS OtpInvalid (→ 401, the attempt increment COMMITS); a db failure THROWS
// (→ 5xx, the tx ROLLS BACK). On success it sets the signed session cookie,
// drops the pending cookie, and RETURNS a redirect — all three ride the outcome.
const readPending = (
  deps: { pendingCookie: Pick<PendingCookie, 'read'> },
  ctx: RequestScope,
): Promise<{ pending: PendingAuth } | Abort> =>
  deps.pendingCookie.read(ctx.request).then((pending) => (pending ? { pending } : unauthorized()))

export const verifyFragment = fragment()
  .body(z.object({ code: z.string().optional() }))
  .guard(readPending)
  .handle(
    async (
      deps: {
        access: {
          verifyCode(
            email: string,
            code: string,
            nonce?: string,
            registration?: Omit<UserRegistration, 'email'>,
          ): Promise<VerifyCodeResult | TaggedError>
        }
        sessionCookie: Pick<SessionCookie, 'apply'>
        pendingCookie: Pick<PendingCookie, 'drop'>
      },
      ctx,
    ) => {
      const result = await deps.access.verifyCode(
        ctx.pending.email,
        ctx.body.code ?? '',
        ctx.pending.nonce,
        ctx.pending.registration,
      )
      if (isError(result)) return abortFor(result)
      deps.sessionCookie.apply(ctx.cookies, result.sessionId)
      deps.pendingCookie.drop(ctx.cookies)
      return redirect(ctx.pending.returnTo ?? '/')
    },
  )

// ── auth: POST /logout ──────────────────────────────────────────────────────
// Drops the session cookie through the sink and redirects. No app dependency
// beyond the cookie helper — the server keeps no session row to revoke here.
export const logoutFragment = fragment().handle(
  (deps: { sessionCookie: Pick<SessionCookie, 'drop'> }, ctx: RequestScope) => {
    deps.sessionCookie.drop(ctx.cookies)
    return redirect('/')
  },
)
