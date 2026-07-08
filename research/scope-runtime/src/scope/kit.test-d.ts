import { describe, expectTypeOf, it } from 'vitest'
import type { Admin, Course, Repos, Session } from '../domain.ts'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { fragment, type Handler } from './fragment.ts'

describe('fragment — the type contract', () => {
  it('a guard reads its declared app slot, the carrier ctx, and its params', () => {
    fragment().guard((app: Pick<Repos, 'sessionRepo'>, params: { courseId: string }, ctx) => {
      expectTypeOf(app.sessionRepo).toEqualTypeOf<Repos['sessionRepo']>()
      expectTypeOf(ctx.request).toEqualTypeOf<Request>()
      expectTypeOf(params.courseId).toEqualTypeOf<string>()
      // the carrier is the request scope only — NO repos leak into ctx
      // @ts-expect-error — repos live in the app slot, not the ctx bag
      ctx.sessionRepo
      const s = app.sessionRepo.get(ctx.request)
      return s ? { session: s } : unauthorized()
    })
  })

  it('later guards see earlier enrichments in ctx, typed; ordering is enforced', () => {
    fragment()
      .guard((app: Pick<Repos, 'sessionRepo'>, _params: {}, ctx) => {
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((app: Pick<Repos, 'adminRepo'>, _params: {}, ctx) => {
        // the previous guard's enrichment is visible, typed
        expectTypeOf(ctx.session).toEqualTypeOf<Session>()
        const a = app.adminRepo.byId(ctx.session.userId)
        return a ? { admin: a } : forbidden()
      })

    // reading an enrichment before the guard that provides it does not compile
    fragment().guard((_app: {}, _params: {}, ctx) => {
      // @ts-expect-error — `admin` is not enriched yet
      return { leaked: ctx.admin }
    })
  })

  it('the leaf sees enrichments + carrier but NEVER the app repos', () => {
    const handler = fragment()
      .guard((app: Pick<Repos, 'sessionRepo'>, _params: {}, ctx) => {
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((app: Pick<Repos, 'adminRepo'>, _params: {}, ctx) => {
        const a = app.adminRepo.byId(ctx.session.userId)
        return a ? { admin: a } : forbidden()
      })
      .guard((app: Pick<Repos, 'courseRepo'>, params: { courseId: string }, ctx) => {
        const c = app.courseRepo.byId(params.courseId)
        if (!c) return notFound()
        return c.ownerId === ctx.admin.id ? { course: c } : forbidden()
      })
      .handle((deps, params) => {
        expectTypeOf(deps.course).toEqualTypeOf<Course>()
        expectTypeOf(deps.admin).toEqualTypeOf<Admin>()
        expectTypeOf(deps.request).toEqualTypeOf<Request>()
        expectTypeOf(params.courseId).toEqualTypeOf<string>()
        // @ts-expect-error — repos are the scope tier's; a leaf must not see them
        deps.courseRepo
        return { title: deps.course.title }
      })

    // the fragment carries its accumulated Need (all three repos) and P
    // (courseId) in the phantom markers the adapter reads.
    expectTypeOf(handler).toMatchTypeOf<
      Handler<Pick<Repos, 'sessionRepo' | 'adminRepo' | 'courseRepo'>, { courseId: string }, { title: string }>
    >()
  })

  it('a guardless leaf still gets the carrier and requires no app', () => {
    const handler = fragment().handle((deps) => {
      expectTypeOf(deps.request).toEqualTypeOf<Request>()
      // @ts-expect-error — no app surface on a leaf
      deps.sessionRepo
      return { pong: true }
    })
    expectTypeOf(handler).toMatchTypeOf<Handler<{}, {}, { pong: boolean }>>()
  })
})
