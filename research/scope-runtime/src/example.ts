import type { App } from './chain.ts'
import { forbidden, notFound, redirect, unauthorized } from './scope/abort.ts'
import { scopeFor } from './scope/kit.ts'

// One guard/leaf model, reused by every host adapter (React Router, Hono,
// Express). The point of the prototype: the same handlers cross three hosts
// unchanged — only the adapter + codec differ.
export function makeHandlers(app: App) {
  const kit = scopeFor(app)

  // The ownership + prefetch stack: authenticate, resolve the admin, then
  // prefetch the course and check ownership — enriching or short-circuiting.
  const ownedCourse = kit
    .guard((d) => {
      const session = d.sessionRepo.get(d.request)
      return session ? { session } : unauthorized()
    })
    .guard((d) => {
      const admin = d.adminRepo.byId(d.session.userId)
      return admin ? { admin } : forbidden()
    })
    .guard((d) => {
      const course = d.courseRepo.byId(d.params.courseId ?? '')
      if (!course) return notFound()
      return course.ownerId === d.admin.id ? { course } : forbidden()
    })

  // The leaf consumes the prefetched enrichment — no repo, no refetch.
  const course = kit.handle(ownedCourse, (deps) => ({
    id: deps.course.id,
    title: deps.course.title,
  }))

  // An action exercising the cookie sink + a redirect abort.
  const login = kit.handle((deps) => {
    deps.cookies.set('sid', deps.params.as ?? 'u-admin', { httpOnly: true, path: '/' })
    return redirect('/dashboard')
  })

  return { course, login }
}
