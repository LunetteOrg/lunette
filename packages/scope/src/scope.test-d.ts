import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { Admin, Course, Repos, Session } from './domain.fixture.ts'
import { forbidden, notFound, unauthorized } from './abort.ts'
import { scope, type Handler, type ScopeExtension, type ScopeExtensionValue } from './scope.ts'
import { request } from './extensions/request.ts'
import type { RequestHead } from './carrier.ts'

// One schema on the scope fixes `P = OutputOf<S>` for every guard and the
// leaf — the params axis now flows from ONE `.input`, not a per-guard
// intersection.
const schema = z.object({ courseId: z.string() })
type S = typeof schema

describe('scope().extend(request) — the type contract', () => {
  it('a guard reads its declared app slot, the carrier ctx, and the schema params', () => {
    scope().extend(request)
      .input(schema)
      .guard((app: Pick<Repos, 'sessionRepo'>, ctx) => {
        expectTypeOf(app.sessionRepo).toEqualTypeOf<Repos['sessionRepo']>()
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // the carrier is the request scope only — NO repos leak into ctx
        // @ts-expect-error — repos live in the app slot, not the ctx bag
        ctx.sessionRepo
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
  })

  it('later guards see earlier enrichments in ctx, typed; ordering is enforced', () => {
    scope().extend(request)
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
    scope().extend(request)
      .input(schema)
      .guard((_app: {}, ctx) => {
        // @ts-expect-error — `admin` is not enriched yet
        return { leaked: ctx.admin }
      })
  })

  it('the leaf sees enrichments + carrier but NEVER the app repos', () => {
    const handler = scope().extend(request)
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
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // @ts-expect-error — repos are the scope tier's; a leaf must not see them in ctx
        ctx.courseRepo
        return { title: ctx.course.title }
      })

    // the scope carries its accumulated Need (all three repos), its schema,
    // and R in the markers the adapter reads.
    expectTypeOf(handler).toMatchTypeOf<
      Handler<Pick<Repos, 'sessionRepo' | 'adminRepo' | 'courseRepo'>, S, { title: string }>
    >()
  })

  // (each extension's contract lives next to it: `src/extensions/*.test-d.ts`.)

  it('a param-less request scope (no .input) still gets the carrier and requires no app', () => {
    const handler = scope().extend(request).handle((_deps: {}, ctx) => {
      expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
      // @ts-expect-error — repos are not in the ctx bag
      ctx.sessionRepo
      return { pong: true }
    })
    expectTypeOf(handler.__result).toEqualTypeOf<{ pong: boolean } | undefined>()
  })
})

describe('scope() — the carrier-agnostic base', () => {
  it('ctx exposes params + enrichments, but NO request and NO cookies', () => {
    scope()
      .input(schema)
      .guard((_app: {}, ctx) => {
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // @ts-expect-error — the agnostic base commits to no carrier: no `request`
        ctx.request
        // @ts-expect-error — no `cookies` sink either (it is the `cookies` extension's)
        ctx.cookies
        return { seen: true as const }
      })
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.seen).toEqualTypeOf<true>()
        // @ts-expect-error — still no `request` at the leaf
        ctx.request
        return { ok: true }
      })
  })

  it('an agnostic scope produces a Handler with Cap = never', () => {
    const handler = scope()
      .input(schema)
      .handle((_deps: {}, ctx) => ({ id: ctx.params.courseId }))
    expectTypeOf(handler.__cap).toEqualTypeOf<((c: never) => never) | undefined>()
    expectTypeOf(handler).toMatchTypeOf<Handler<Record<never, never>, S, { id: string }>>()
  })
})

// The collision gate (§4) covers the BUILDER's own verbs, not only other
// extensions': an extension contributing `guard` would otherwise replace the
// real one at runtime, since extensions mount after the base.
interface HijacksGuard extends ScopeExtension {
  readonly __methods?: { guard: true }
}
declare const hijacksGuard: HijacksGuard & ScopeExtensionValue

interface OwnMethod extends ScopeExtension {
  readonly __methods?: { sniff: true }
}
declare const ownMethod: OwnMethod & ScopeExtensionValue

describe('the collision gate covers the base verbs', () => {
  it('rejects an extension that redefines one, and accepts a name of its own', () => {
    // @ts-expect-error an extension may not redefine a verb the builder owns
    scope().extend(hijacksGuard)
    scope().extend(ownMethod)
  })
})
