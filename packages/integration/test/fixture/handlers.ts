import { z } from 'zod'
import type {
  Admin,
  AdminRepo,
  Course,
  CourseRepo,
  CourseView,
  Session,
  SessionRepo,
} from './domain.ts'
import type { RequestHead } from '@lntt/scope'
import { scope } from '@lntt/scope'
import { cookies } from '@lntt/scope/cookies'
import type { CookieSink } from '@lntt/scope/cookies'
import { forbidden, http, notFound, redirect, unauthorized } from '@lntt/scope/http'
import * as rpc from '@lntt/scope/trpc'

// One guard/leaf model, reused by every HOST-SPECIFIC wiring below (React
// Router, Hono, Express and tRPC). Only the SCHEMA and the pure domain
// functions (below) are shared across every host — each carrier's vocabulary
// belongs to that carrier alone (§ the core coins no vocabulary), so a
// version of the decision functions exists PER carrier family
// (`authenticate`/… for HTTP hosts, `authenticateRpc`/… for tRPC), each
// calling that carrier's OWN abort constructors. Deps and params are
// reconciled at the adapter, at compile time; the schema feeds every host's
// native validator (Hono `sValidator`, tRPC `.input`, our RR7/Express runtime
// validation).

// The scope's input contracts. `courseId` stays a string (the RPC input the
// typed client reconstructs); coercion is demonstrated in the scope-input
// probe with `z.coerce.number()`.
export const courseSchema = z.object({ courseId: z.string() })
// No route params — `POST /login` names none, and the route gate now checks
// the pattern against this schema's keys in BOTH directions (§ WE WRITE NO
// PARSER): a schema field with no matching `:name` segment is a compile
// error at the mount, which is exactly what caught the STALE `as` override
// this schema used to declare (never wired to any route pattern, never
// exercised by a test with a non-default value — dead by construction).
export const loginSchema = z.object({})

// The one piece of domain logic with NO carrier vocabulary in it at all —
// reused unchanged everywhere.
export const shapeCourse = (course: Course): { id: string; title: string } => ({
  id: course.id,
  title: course.title,
})

// ── HTTP-flavoured decisions (Hono / Express / React Router) ────────────────
// Factored as PURE functions (no host, only the carrier's vocabulary) so the
// domain rule lives once PER carrier family — the reuse unit blueprint §3.4
// describes, now scoped to "one family", not "every host": tRPC's equivalents
// below say the SAME rule in tRPC's own words, because sharing one "semantic"
// Abort across carriers is HTTP in disguise (the design this phase enforces).
// NO explicit `| Abort` return annotation: `Abort` written bare means "an
// intent nobody declared" and fails the definition-side gate CLOSED even on
// a scope that extended the right carrier (guarantee 2, `intent-vocabulary
// .test-d.ts`). Leaving the return type INFERRED is what lets the concrete
// constructor's own intent (`{ readonly status: true }`, …) survive through
// this helper indirection to the guard that calls it.
export const authenticate = (sessionRepo: SessionRepo, request: RequestHead) => {
  const session = sessionRepo.get(request)
  return session ? { session } : unauthorized()
}

export const resolveAdmin = (adminRepo: AdminRepo, userId: string) => {
  const admin = adminRepo.byId(userId)
  return admin ? { admin } : forbidden()
}

export const resolveCourse = (courseRepo: CourseRepo, courseId: string, adminId: string) => {
  const course = courseRepo.byId(courseId)
  if (!course) return notFound()
  return course.ownerId === adminId ? { course } : forbidden('not owner')
}

// ── The scope-shaped guard/leaf consts (HTTP hosts) ──────────────────────
// Named so RR7/Hono/Express build `courseHandler` from them.
// Each guard/leaf is `(deps, ctx)`: `deps` is its inline, structural app
// requirement (no `Pick` from a global), `ctx` the carrier + validated
// `params` + prior enrichments. The guards read repos for auth/prefetch; the
// leaf declares a use-case service and calls it.
export const authGuard = ({ sessionRepo }: { sessionRepo: SessionRepo }, ctx: { request: RequestHead }) =>
  authenticate(sessionRepo, ctx.request)

export const adminGuard = (
  { adminRepo }: { adminRepo: AdminRepo },
  ctx: { session: Session },
) => resolveAdmin(adminRepo, ctx.session.userId)

export const courseGuard = (
  { courseRepo }: { courseRepo: CourseRepo },
  ctx: { admin: Admin; params: { courseId: string } },
) => resolveCourse(courseRepo, ctx.params.courseId, ctx.admin.id)

// The leaf IS the use case: it declares `courseView` (a service, not a repo)
// and delegates the domain work, reading the prefetched `course` from ctx.
// Carrier-free — reused by both the HTTP and the RPC handler below.
export const courseLeaf = (
  { courseView }: { courseView: CourseView },
  ctx: { course: Course },
): { id: string; title: string } => courseView.detail(ctx.course)

// The ownership + prefetch stack: authenticate, resolve the admin, then
// prefetch the course and check ownership — enriching or short-circuiting. The
// leaf consumes the prefetched enrichment — no repo, no refetch.
// `.extend(http)` is what DECLARES the `status` intent `unauthorized`/
// `forbidden`/`notFound` return — the definition-side gate (`DeclGate`) is
// what forces this, not a convention.
export const courseHandler = scope()
  .extend(http)
  .params(courseSchema)
  .guard(authGuard)
  .guard(adminGuard)
  .guard(courseGuard)
  .handle(courseLeaf)

// An action exercising the cookie sink + a redirect abort. NO `: Abort`
// return annotation, for the same reason as `authenticate` above: an
// annotated bare `Abort` would erase `redirect()`'s own declared intent
// before `.handle`'s gate ever sees it.
export const loginLeaf = (_deps: {}, ctx: { cookies: CookieSink }) => {
  ctx.cookies.set('sid', 'u-admin', { httpOnly: true, path: '/' })
  return redirect('/dashboard')
}

export const loginHandler = scope()
  .extend(http)
  .extend(cookies)
  .params(loginSchema)
  .handle(loginLeaf)

// ── tRPC-flavoured decisions ─────────────────────────────────────────────
// Same rule, same repos, tRPC's OWN words: `notFound()` here is a code, not a
// 404, and `abortToTRPCError` (`@lntt/integration/trpc`) is the one place a
// RETURNED Abort becomes a THROWN TRPCError.
export const authenticateRpc = (sessionRepo: SessionRepo, request: RequestHead) => {
  const session = sessionRepo.get(request)
  return session ? { session } : rpc.unauthorized()
}

export const resolveAdminRpc = (adminRepo: AdminRepo, userId: string) => {
  const admin = adminRepo.byId(userId)
  return admin ? { admin } : rpc.forbidden()
}

export const resolveCourseRpc = (courseRepo: CourseRepo, courseId: string, adminId: string) => {
  const course = courseRepo.byId(courseId)
  if (!course) return rpc.notFound()
  return course.ownerId === adminId ? { course } : rpc.forbidden('not owner')
}

export const authGuardRpc = (
  { sessionRepo }: { sessionRepo: SessionRepo },
  ctx: { request: RequestHead },
) => authenticateRpc(sessionRepo, ctx.request)

export const adminGuardRpc = (
  { adminRepo }: { adminRepo: AdminRepo },
  ctx: { session: Session },
) => resolveAdminRpc(adminRepo, ctx.session.userId)

export const courseGuardRpc = (
  { courseRepo }: { courseRepo: CourseRepo },
  ctx: { admin: Admin; params: { courseId: string } },
) => resolveCourseRpc(courseRepo, ctx.params.courseId, ctx.admin.id)

// The tRPC-mounted twin of `courseHandler` — same shape, same repos, same
// `courseLeaf`, but `.extend(rpc.rpc)` declares tRPC's OWN `code` intent
// instead of http's `status`, which is what makes it mount on `toProcedure`/
// `toMutation` and REJECTS on Hono/Express/RR7 (they render http's set, not
// tRPC's) — the mount-side half of the same gate `courseHandler` proves on
// the definition side.
export const courseHandlerRpc = scope()
  .extend(rpc.rpc)
  .input(courseSchema)
  .guard(authGuardRpc)
  .guard(adminGuardRpc)
  .guard(courseGuardRpc)
  .handle(courseLeaf)
