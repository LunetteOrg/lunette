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
import { type Abort, forbidden, notFound, redirect, unauthorized } from '@lntt/scope'
import { scope } from '@lntt/scope'
import { request } from '@lntt/scope/request'
import { cookies } from '@lntt/scope/cookies'
import type { CookieSink, RequestHead } from '@lntt/scope'

// One guard/leaf model, reused by every host adapter (React Router, Hono,
// Express) AND the bus. The point of the prototype: the same handlers cross
// every host unchanged — only the adapter + codec differ. The handlers are
// abstract FRAGMENTS: they declare their input contract with ONE `.input`
// schema (a Standard Schema — here zod), declare their app requirement (the
// repos each guard reads, in its dedicated first slot), and bind to NO concrete
// app. Deps and params are reconciled at the adapter, at compile time; the
// schema feeds every host's native validator (Hono `sValidator`, tRPC
// `.input`, our RR7/Express/bus runtime validation).

// The scope's input contracts. `courseId` stays a string (the RPC input the
// typed client reconstructs); coercion is demonstrated in the scope-input
// probe with `z.coerce.number()`.
export const courseSchema = z.object({ courseId: z.string() })
export const loginSchema = z.object({ as: z.string().optional() })

// ── Domain logic, factored as PURE functions (no carrier, no host) ──────────
// This is the reuse unit across hosts (blueprint §3.4): the tRPC procedure
// re-expresses its guards natively but calls the SAME decision functions, so
// the domain rule lives once. Each returns an enrichment or a RETURNED Abort.
export const authenticate = (
  sessionRepo: SessionRepo,
  request: RequestHead,
): { session: Session } | Abort => {
  const session = sessionRepo.get(request)
  return session ? { session } : unauthorized()
}

export const resolveAdmin = (adminRepo: AdminRepo, userId: string): { admin: Admin } | Abort => {
  const admin = adminRepo.byId(userId)
  return admin ? { admin } : forbidden()
}

export const resolveCourse = (
  courseRepo: CourseRepo,
  courseId: string,
  adminId: string,
): { course: Course } | Abort => {
  const course = courseRepo.byId(courseId)
  if (!course) return notFound()
  return course.ownerId === adminId ? { course } : forbidden('not owner')
}

export const shapeCourse = (course: Course): { id: string; title: string } => ({
  id: course.id,
  title: course.title,
})

// ── The scope-shaped guard/leaf consts (HTTP/bus hosts) ──────────────────
// Named so RR7/Hono/Express/bus build `courseHandler` from them, and the tRPC
// procedure reuses the SAME decision functions above.
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
export const courseLeaf = (
  { courseView }: { courseView: CourseView },
  ctx: { course: Course },
): { id: string; title: string } => courseView.detail(ctx.course)

// The ownership + prefetch stack: authenticate, resolve the admin, then
// prefetch the course and check ownership — enriching or short-circuiting. The
// leaf consumes the prefetched enrichment — no repo, no refetch.
export const courseHandler = scope().extend(request)
  .input(courseSchema)
  .guard(authGuard)
  .guard(adminGuard)
  .guard(courseGuard)
  .handle(courseLeaf)

// An action exercising the cookie sink + a redirect abort. Its one optional
// param `{ as?: string }` now comes from the `.input` schema.
export const loginLeaf = (
  _deps: {},
  ctx: { cookies: CookieSink; params: { as?: string | undefined } },
): Abort => {
  ctx.cookies.set('sid', ctx.params.as ?? 'u-admin', { httpOnly: true, path: '/' })
  return redirect('/dashboard')
}

export const loginHandler = scope().extend(cookies).input(loginSchema).handle(loginLeaf)
