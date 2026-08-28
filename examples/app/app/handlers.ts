// The composition surface over the feature-oriented `handlers/` directory. The
// directory holds ONLY pure functions (guards, leaves, schemas, types, the
// error→outcome maps); every `scope()` wiring lives HERE, one declarative line
// per route. The scope runtime ships as @lntt/scope (host-agnostic) plus
// @lntt/integration (per-host adapters); the per-host wiring (build-once +
// mount + to*) lives in the separate entry packages (e.g. examples/rr7), which
// import these scopes unchanged. A file `handlers.ts` and a sibling directory
// `handlers/` coexist, so this import path stays put.
//
// Every carrier extension owns its own vocabulary (§ the core coins no
// vocabulary): a scope that ABORTS or reads `ctx.request` must `.extend` the
// carrier whose words it uses, and that carrier is different on an HTTP host
// (`@lntt/scope/http`, `.params`) than on tRPC (`@lntt/scope/trpc`, `.input`).
// A scope that never aborts and never reads `ctx.request` (`feedGuard`,
// `commentsHandler`) needs no carrier at all for ITS OWN logic — but `.params`/
// `.input` are carrier METHODS too, so even a param-only, abort-free scope
// still extends one to get an input channel. The upshot, decided for this
// phase: a scope that is genuinely mounted on both host families (reads,
// mostly) is authored TWICE — once per carrier — because the input verb and
// the abort words it may need are never the same two. The DOMAIN (the pure
// functions in `handlers/`) stays shared; only this wiring differs.
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import { cookies } from '@lntt/scope/cookies'
import { http } from '@lntt/scope/http'
import * as rpc from '@lntt/scope/trpc'
import { authGuard, authGuardRpc, pendingGuard, sessionGuard } from './handlers/guards.ts'
import {
  type CommentDeps,
  type PublishDeps,
  commentBody,
  commentHandler,
  commentHandlerRpc,
  commentsHandler,
  feedGuard,
  feedHandler,
  postGuard,
  postGuardRpc,
  postHandler,
  publishBody,
  publishHandler,
  publishHandlerRpc,
} from './handlers/threads.ts'
import {
  type PreferenceDeps,
  identityHandler,
  identityHandlerRpc,
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

// ── base scopes: the shared guard-plumbing, factored once PER HOST FAMILY ──
// `.params`/`.input` are FIRST-ONLY on the builder, so a base that fixes a
// route-param/payload schema must call it INSIDE the helper, before the
// guards. Each base preserves `Cap` (a `.body` scope built on `gated` still
// gates off tRPC) and keeps accumulating `Need`/`Acc` for whatever
// `.body`/`.handle` follows.

// Gated, no route param: read the session, then narrow it or 401 (http words).
const gated = () => scope().extend(http).guard(sessionGuard).guard(authGuard)

// Gated, with a route-param schema fixed FIRST (before the guards), so the
// leaf reads `ctx.params` typed while still sitting behind the session gate.
const gatedWith = <S extends z.ZodTypeAny>(schema: S) =>
  scope().extend(http).params(schema).guard(sessionGuard).guard(authGuard)

// The tRPC twins: same shape, tRPC's OWN `.input` verb and `code` words.
const gatedRpc = () => scope().extend(rpc.rpc).guard(sessionGuard).guard(authGuardRpc)

const gatedWithRpc = <S extends z.ZodTypeAny>(schema: S) =>
  scope().extend(rpc.rpc).input(schema).guard(sessionGuard).guard(authGuardRpc)

// ── read path: GET /feed (all four hosts) ────────────────────────────────────
// One declarative line: guard + leaf, each a named pure function. The feed is an
// anonymous read — it needs no session at all, so it composes the fetch guard
// directly, no session guard. Never aborts and never reads `ctx.request`, so it
// extends no carrier at all — the same scope object mounts on every host.
export const feedScope = scope().guard(feedGuard).handle(feedHandler)

// ── read path: GET /posts/:postId (Hono / Express / RR7) ─────────────────────
// The shared session read (anonymous is allowed, so NOT the gate); then the
// prefetch guard (aborts `notFound()`, http's word); then the trivial shape
// leaf.
export const postScope = scope()
  .extend(http)
  .params(z.object({ postId: z.string() }))
  .guard(sessionGuard)
  .guard(postGuard)
  .handle((_deps: {}, ctx) => postHandler(_deps, ctx))

// The tRPC-mounted twin: same shape, tRPC's `.input` + `postGuard`'s own
// `notFound()` twin.
export const postProcedure = scope()
  .extend(rpc.rpc)
  .input(z.object({ postId: z.string() }))
  .guard(sessionGuard)
  .guard(postGuardRpc)
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
// (which read only headers, so they work on tRPC too) and the domain fetch
// inside `publishHandlerRpc` are shared with the HTTP path; only the
// error→outcome translation differs (`rpcAbortFor`, inside `publishHandlerRpc`).
// The gated-with-input base fixes the payload FIRST, then the gate. Required
// payload fields are assignable to the optional `PublishFields`.
export const publishPostProcedure = gatedWithRpc(
  z.object({
    title: z.string(),
    body: z.string(),
    status: z.enum(['draft', 'published']).optional(),
  }),
).handle((deps: PublishDeps, ctx) => publishHandlerRpc(deps, ctx.session.userId, ctx.params))

// ── write path: POST /posts/:postId/comments ─────────────────────────────────
// The gated-with-params base fixes the ROUTE param (`postId`); the body carries
// the comment.
export const commentScope = gatedWith(z.object({ postId: z.string() })) // the ROUTE param
  .extend(body)
  .body(commentBody) // the JSON body
  .handle((deps: CommentDeps, ctx) =>
    commentHandler(deps, ctx.params.postId, ctx.session.userId, ctx.body),
  )

// The tRPC-shaped comment write: postId + body + parentId all ride the RPC
// payload (`.input`), so it clears the capability gate and mounts as a mutation.
export const commentProcedure = gatedWithRpc(
  z.object({
    postId: z.string(),
    body: z.string(),
    parentId: z.string().optional(),
  }),
).handle((deps: CommentDeps, ctx) =>
  commentHandlerRpc(deps, ctx.params.postId, ctx.session.userId, ctx.params),
)

// ── read path: GET /posts/:postId/comments (Hono / Express / RR7) ────────────
// Public read, one route param, no body — a thin wiring over `commentsHandler`.
export const commentsScope = scope().extend(http).params(z.object({ postId: z.string() })).handle(commentsHandler)

// The tRPC-mounted twin: `commentsHandler` is carrier-free (never aborts,
// never reads `ctx.request`), so only the input verb differs.
export const commentsProcedure = scope()
  .extend(rpc.rpc)
  .input(z.object({ postId: z.string() }))
  .handle(commentsHandler)

// ── read path: GET /me (gated) ───────────────────────────────────────────────
// No input, no body: mounts on all HTTP hosts. The gated base makes it 401 when
// anonymous; a signed-in viewer with no profile row is a 404 (via the leaf).
export const identityScope = gated().handle(identityHandler)

// The tRPC-mounted twin: same gate, tRPC's own `notFound()`.
export const identityProcedure = gatedRpc().handle(identityHandlerRpc)

// ── write path: POST /me/preference (gated) ──────────────────────────────────
export const setPreferenceScope = gated()
  .extend(body)
  .body(z.object({ surface: z.string().optional() }))
  .handle((deps: PreferenceDeps, ctx) =>
    preferenceHandler(deps, ctx.session.userId, ctx.body.surface),
  )

// The tRPC-shaped preference write: the surface rides the RPC payload.
// `preferenceHandler` never aborts, so it is shared unchanged.
export const setPreferenceProcedure = gatedWithRpc(z.object({ surface: z.string() })).handle(
  (deps: PreferenceDeps, ctx) => preferenceHandler(deps, ctx.session.userId, ctx.params.surface),
)

// ── auth: POST /login ────────────────────────────────────────────────────────
// One guard owns the side-effecting path; the leaf is a pure success shape.
// HTTP-only — no tRPC route (a form post + a Set-Cookie response have no RPC
// meaning).
export const loginScope = scope()
  .extend(http)
  .extend(body)
  .extend(cookies)
  .form(loginForm)
  .guard(loginGuard)
  .handle(() => ({ ok: true as const }))

// ── auth: POST /verify ───────────────────────────────────────────────────────
// `pendingGuard` reads the signed pending cookie (no cookie → 401); `verifyHandler`
// runs the transaction window and rides the cookie set + redirect on the outcome.
export const verifyScope = scope()
  .extend(http)
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
  .extend(http)
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
export const logoutScope = scope().extend(http).extend(cookies).handle(logoutHandler)
