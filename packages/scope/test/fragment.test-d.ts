import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { Admin, Course, Repos, Session } from './domain.ts'
import { forbidden, notFound, unauthorized } from '../src/abort.ts'
import { fragment, type Handler } from '../src/fragment.ts'

// One schema on the fragment fixes `P = OutputOf<S>` for every guard and the
// leaf — the params axis now flows from ONE `.input`, not a per-guard
// intersection.
const schema = z.object({ courseId: z.string() })
type S = typeof schema

describe('fragment — the type contract', () => {
  it('a guard reads its declared app slot, the carrier ctx, and the schema params', () => {
    fragment()
      .input(schema)
      .guard((app: Pick<Repos, 'sessionRepo'>, ctx) => {
        expectTypeOf(app.sessionRepo).toEqualTypeOf<Repos['sessionRepo']>()
        expectTypeOf(ctx.request).toEqualTypeOf<Request>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // the carrier is the request scope only — NO repos leak into ctx
        // @ts-expect-error — repos live in the app slot, not the ctx bag
        ctx.sessionRepo
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
  })

  it('later guards see earlier enrichments in ctx, typed; ordering is enforced', () => {
    fragment()
      .input(schema)
      .guard((app: Pick<Repos, 'sessionRepo'>, ctx) => {
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((app: Pick<Repos, 'adminRepo'>, ctx) => {
        // the previous guard's enrichment is visible, typed
        expectTypeOf(ctx.session).toEqualTypeOf<Session>()
        const a = app.adminRepo.byId(ctx.session.userId)
        return a ? { admin: a } : forbidden()
      })

    // reading an enrichment before the guard that provides it does not compile
    fragment()
      .input(schema)
      .guard((_app: {}, ctx) => {
        // @ts-expect-error — `admin` is not enriched yet
        return { leaked: ctx.admin }
      })
  })

  it('the leaf sees enrichments + carrier but NEVER the app repos', () => {
    const handler = fragment()
      .input(schema)
      .guard((app: Pick<Repos, 'sessionRepo'>, ctx) => {
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
      .guard((app: Pick<Repos, 'adminRepo'>, ctx) => {
        const a = app.adminRepo.byId(ctx.session.userId)
        return a ? { admin: a } : forbidden()
      })
      .guard((app: Pick<Repos, 'courseRepo'>, ctx) => {
        const c = app.courseRepo.byId(ctx.params.courseId)
        if (!c) return notFound()
        return c.ownerId === ctx.admin.id ? { course: c } : forbidden()
      })
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.course).toEqualTypeOf<Course>()
        expectTypeOf(ctx.admin).toEqualTypeOf<Admin>()
        expectTypeOf(ctx.request).toEqualTypeOf<Request>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // @ts-expect-error — repos are the scope tier's; a leaf must not see them in ctx
        ctx.courseRepo
        return { title: ctx.course.title }
      })

    // the fragment carries its accumulated Need (all three repos), its schema,
    // and R in the markers the adapter reads.
    expectTypeOf(handler).toMatchTypeOf<
      Handler<Pick<Repos, 'sessionRepo' | 'adminRepo' | 'courseRepo'>, S, { title: string }>
    >()
  })

  it('a param-less fragment (no .input) still gets the carrier and requires no app', () => {
    const handler = fragment().handle((_deps: {}, ctx) => {
      expectTypeOf(ctx.request).toEqualTypeOf<Request>()
      // @ts-expect-error — repos are not in the ctx bag
      ctx.sessionRepo
      return { pong: true }
    })
    expectTypeOf(handler.__result).toEqualTypeOf<{ pong: boolean } | undefined>()
  })
})
