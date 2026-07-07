import { describe, expectTypeOf, it } from 'vitest'
import type { App } from '../chain.ts'
import type { Admin, Course, Session } from '../domain.ts'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { scopeFor, type ScopeHandler } from './kit.ts'

const kit = scopeFor({} as App)

describe('scope kit — type contract', () => {
  it('a guard sees the app surface and the request scope', () => {
    kit.guard((deps) => {
      expectTypeOf(deps.sessionRepo).toEqualTypeOf<App['sessionRepo']>()
      expectTypeOf(deps.request).toEqualTypeOf<Request>()
      expectTypeOf(deps.params).toEqualTypeOf<Record<string, string>>()
      const s = deps.sessionRepo.get(deps.request)
      return s ? { session: s } : unauthorized()
    })
  })

  it('later guards see earlier enrichments; ordering is a type constraint', () => {
    kit
      .guard((d) => {
        const s = d.sessionRepo.get(d.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((d) => {
        // the previous guard's enrichment is visible, typed
        expectTypeOf(d.session).toEqualTypeOf<Session>()
        const a = d.adminRepo.byId(d.session.userId)
        return a ? { admin: a } : forbidden()
      })

    // reading an enrichment before the guard that provides it does not compile
    kit.guard((d) => {
      // @ts-expect-error — `admin` is not in scope yet
      return { leaked: d.admin }
    })
  })

  it('the leaf sees enrichments + scope but NEVER the app repos', () => {
    const owned = kit
      .guard((d) => {
        const s = d.sessionRepo.get(d.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((d) => {
        const a = d.adminRepo.byId(d.session.userId)
        return a ? { admin: a } : forbidden()
      })
      .guard((d) => {
        // prefetch the resource, check ownership, enrich — or short-circuit
        const c = d.courseRepo.byId(d.params.courseId ?? '')
        if (!c) return notFound()
        return c.ownerId === d.admin.id ? { course: c } : forbidden()
      })

    const handler = kit.handle(owned, (deps) => {
      expectTypeOf(deps.course).toEqualTypeOf<Course>()
      expectTypeOf(deps.admin).toEqualTypeOf<Admin>()
      expectTypeOf(deps.request).toEqualTypeOf<Request>()
      // @ts-expect-error — repos are the scope tier's; a leaf must not see them
      deps.courseRepo
      return { title: deps.course.title }
    })

    expectTypeOf(handler).toEqualTypeOf<ScopeHandler<{ title: string }>>()
  })

  it('a guardless leaf still gets the request scope', () => {
    const handler = kit.handle((deps) => {
      expectTypeOf(deps.request).toEqualTypeOf<Request>()
      // @ts-expect-error — no app surface on a leaf
      deps.sessionRepo
      return { pong: true }
    })
    expectTypeOf(handler).toEqualTypeOf<ScopeHandler<{ pong: boolean }>>()
  })
})
