import type { Repos } from './domain.ts'
import { forbidden, notFound, redirect, unauthorized } from './scope/abort.ts'
import { fragment } from './scope/fragment.ts'

// One guard/leaf model, reused by every host adapter (React Router, Hono,
// Express) AND the bus. The point of the prototype: the same handlers cross
// every host unchanged — only the adapter + codec differ. The handlers are
// abstract FRAGMENTS: they declare their app requirement (the repos each guard
// reads, in its dedicated first slot) and their route params, but bind to NO
// concrete app. Deps and params are reconciled at the adapter, at compile time.

// The ownership + prefetch stack: authenticate, resolve the admin, then
// prefetch the course and check ownership — enriching or short-circuiting.
export const courseHandler = fragment()
  .guard((app: Pick<Repos, 'sessionRepo'>, _params: {}, ctx) => {
    const session = app.sessionRepo.get(ctx.request)
    return session ? { session } : unauthorized()
  })
  .guard((app: Pick<Repos, 'adminRepo'>, _params: {}, ctx) => {
    const admin = app.adminRepo.byId(ctx.session.userId)
    return admin ? { admin } : forbidden()
  })
  .guard((app: Pick<Repos, 'courseRepo'>, params: { courseId: string }, ctx) => {
    const course = app.courseRepo.byId(params.courseId)
    if (!course) return notFound()
    return course.ownerId === ctx.admin.id ? { course } : forbidden()
  })
  // The leaf consumes the prefetched enrichment — no repo, no refetch.
  .handle((deps) => ({ id: deps.course.id, title: deps.course.title }))

// An action exercising the cookie sink + a redirect abort. It declares no app
// requirement and reads one optional param.
export const loginHandler = fragment().handle((deps, params: { as?: string }) => {
  deps.cookies.set('sid', params.as ?? 'u-admin', { httpOnly: true, path: '/' })
  return redirect('/dashboard')
})
