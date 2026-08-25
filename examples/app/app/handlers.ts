// The composition surface over the feature-oriented `handlers/` directory. The
// directory holds ONLY pure functions (guards, leaves, schemas, types, the
// error→status map); every `scope()` wiring lives HERE, one declarative line
// per route. The scope runtime ships as @lntt/scope (host-agnostic) plus
// @lntt/integration (per-host adapters); the per-host wiring (build-once +
// mount + to*) lives in the separate entry packages (e.g. examples/rr7), which
// import these scopes unchanged. A file `handlers.ts` and a sibling directory
// `handlers/` coexist, so this import path stays put.
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { body } from '@lntt/scope/body'
import { cookies } from '@lntt/scope/cookies'
import { authGuard, pendingGuard, sessionGuard } from './handlers/guards.ts'
import {
  type CommentDeps,
  type PublishDeps,
  commentBody,
  commentHandler,
  commentsHandler,
  feedGuard,
  feedHandler,
  postGuard,
  postHandler,
  publishBody,
  publishHandler,
} from './handlers/threads.ts'
import {
  type PreferenceDeps,
  identityHandler,
  preferenceHandler,
} from './handlers/profile.ts'
import {
  loginForm,
  loginGuard,
  logoutHandler,
  verifyBody,
  verifyForm,
  verifyHandler,
} from './handlers/auth.ts'

// The pure feed pieces stay reachable through this surface: a single host can
// compose the feed route INLINE (the single-host idiom, `feedGuard` + a
// `.handle(feedHandler)`) instead of importing `feedScope`.
export { feedGuard, feedHandler } from './handlers/threads.ts'

// ── base scopes: the shared guard-plumbing, factored once ─────────────────
// `.input` is FIRST-ONLY on the builder, so a base that fixes a route-param
// schema must call `.input` INSIDE the helper, before the guards. Each base
// preserves `Cap` (a `.body` scope built on `gated` still gates off tRPC)
// and keeps accumulating `Need`/`Acc` for whatever `.body`/`.handle` follows.

// Gated, no route param: read the session, then narrow it or 401.
const gated = () => scope().extend(request).guard(sessionGuard).guard(authGuard)

// Gated, with a route-param schema fixed FIRST (before the guards), so the
// leaf reads `ctx.params` typed while still sitting behind the session gate.
const gatedWith = <S extends z.ZodTypeAny>(schema: S) =>
  scope().extend(request).input(schema).guard(sessionGuard).guard(authGuard)

// ── read path: GET /feed (all four hosts) ────────────────────────────────────
// One declarative line: guard + leaf, each a named pure function. The feed is an
// anonymous read — it needs no session at all, so it composes the fetch guard
// directly, no session guard.
export const feedScope = scope().guard(feedGuard).handle(feedHandler)

// ── read path: GET /posts/:postId (all four hosts) ───────────────────────────
// The shared session read (anonymous is allowed, so NOT the gate); then the
// prefetch guard; then the trivial shape leaf.
export const postScope = scope().extend(request)
  .input(z.object({ postId: z.string() }))
  .guard(sessionGuard)
  .guard(postGuard)
  .handle((_deps: {}, ctx) => postHandler(_deps, ctx))

// ── write path: POST /posts ──────────────────────────────────────────────────
// The gated base opens with the session gate; `.body` = the JSON body channel,
// validated onto `ctx.body` (HTTP-only). The author is the gated session, never
// the client.
export const publishPostScope = gated()
  .extend(body)
  .body(publishBody)
  .handle((deps: PublishDeps, ctx) => publishHandler(deps, ctx.session.userId, ctx.body))

// The BROWSER-shaped write: the same use case again, reading the form an HTML
// `<Form method="post">` submits instead of a JSON body. The input CHANNEL
// follows the CLIENT, not the host — a React Router page posts a form, an API
// client posts JSON, and both reach `publishHandler` unchanged.
export const publishPostFormScope = gated()
  .extend(body)
  .form(publishBody)
  .handle((deps: PublishDeps, ctx) => publishHandler(deps, ctx.session.userId, ctx.form))

// The tRPC-shaped write: the SAME use case as publishPostScope, authored for
// RPC. Its whole input is the payload (`.input`, not `.body`), so it carries NO
// `body` capability and mounts on tRPC — as a MUTATION — while the auth guards
// (which read only headers, so they work on tRPC too) and `publishHandler` are
// shared. The gated-with-input base fixes the payload FIRST, then the gate.
// Required payload fields are assignable to the optional `PublishFields`.
export const publishPostProcedure = gatedWith(
  z.object({
    title: z.string(),
    body: z.string(),
    status: z.enum(['draft', 'published']).optional(),
  }),
).handle((deps: PublishDeps, ctx) => publishHandler(deps, ctx.session.userId, ctx.params))

// ── write path: POST /posts/:postId/comments ─────────────────────────────────
// The gated-with-input base fixes the ROUTE param (`postId`); the body carries
// the comment.
export const commentScope = gatedWith(z.object({ postId: z.string() })) // the ROUTE param
  .extend(body)
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
// Public read, one route param, no body — so it also mounts on tRPC (input =
// the RPC payload `{ postId }`). Thin wiring over `commentsHandler`.
export const commentsScope = scope()
  .input(z.object({ postId: z.string() }))
  .handle(commentsHandler)

// ── read path: GET /me (gated) ───────────────────────────────────────────────
// No input, no body: mounts on all four hosts. The gated base makes it 401 when
// anonymous; a signed-in viewer with no profile row is a 404 (via the leaf).
export const identityScope = gated().handle(identityHandler)

// ── write path: POST /me/preference (gated) ──────────────────────────────────
export const setPreferenceScope = gated()
  .extend(body)
  .body(z.object({ surface: z.string().optional() }))
  .handle((deps: PreferenceDeps, ctx) =>
    preferenceHandler(deps, ctx.session.userId, ctx.body.surface),
  )

// The tRPC-shaped preference write: the surface rides the RPC payload.
export const setPreferenceProcedure = gatedWith(z.object({ surface: z.string() })).handle(
  (deps: PreferenceDeps, ctx) => preferenceHandler(deps, ctx.session.userId, ctx.params.surface),
)

// ── auth: POST /login ────────────────────────────────────────────────────────
// One guard owns the side-effecting path; the leaf is a pure success shape.
export const loginScope = scope()
  .extend(body)
  .extend(cookies)
  .form(loginForm)
  .guard(loginGuard)
  .handle(() => ({ ok: true as const }))

// ── auth: POST /verify ───────────────────────────────────────────────────────
// `pendingGuard` reads the signed pending cookie (no cookie → 401); `verifyHandler`
// runs the transaction window and rides the cookie set + redirect on the outcome.
export const verifyScope = scope()
  .extend(request)
  .extend(body)
  .extend(cookies)
  .body(verifyBody)
  .guard(pendingGuard)
  .handle(verifyHandler)

// The browser-shaped verify: same guard, same handler, reading the form an HTML
// `<Form>` posts. `termsAccepted` arrives as the string a checkbox sends, so the
// schema coerces it — the shape difference between a form and a JSON body lives
// in the SCHEMA, not in the use case.
export const verifyFormScope = scope()
  .extend(request)
  .extend(body)
  .extend(cookies)
  .form(verifyForm)
  .guard(pendingGuard)
  // `.body` and `.form` are DIFFERENT ctx channels (`ctx.body` / `ctx.form`), so
  // the shared handler — written against the JSON one — is fed explicitly. The
  // adaptation is one line and visible, rather than the two channels quietly
  // collapsing into one.
  .handle((deps: Parameters<typeof verifyHandler>[0], ctx) =>
    verifyHandler(deps, { pending: ctx.pending, body: ctx.form, cookies: ctx.cookies }),
  )

// ── auth: POST /logout ───────────────────────────────────────────────────────
export const logoutScope = scope().extend(cookies).handle(logoutHandler)
