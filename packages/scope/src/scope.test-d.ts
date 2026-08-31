import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { Admin, Course, Repos, Session } from './domain.fixture.ts'
import { forbidden, notFound, unauthorized } from './extensions/http.ts'
import { scope, type Channel, type Handler, type ScopeExtensionValue } from './scope.ts'
import { http } from './extensions/http.ts'
import type { RequestHead } from './carrier.ts'
import { standardSchema } from './extensions/standard-schema.ts'

// One schema, fixed through the carrier's own input verb (`http`'s `.params`,
// since `.input` is not part of the carrier-agnostic core — see `§ the core
// coins no vocabulary`), fixes `P = OutputOf<S>` for every guard and the leaf.
const schema = z.object({ courseId: z.string() })
type S = typeof schema

describe('scope(http) — the type contract', () => {
  it('a guard reads its declared app slot, the carrier ctx, and the schema params', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', schema)
      .guard((app: Pick<Repos, 'sessionRepo'>, ctx) => {
        expectTypeOf(app.sessionRepo).toEqualTypeOf<Repos['sessionRepo']>()
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<string>()
        // the carrier is the http scope only — NO repos leak into ctx
        // @ts-expect-error — repos live in the app slot, not the ctx bag
        ctx.sessionRepo
        const s = app.sessionRepo.get(ctx.request)
        return s ? { session: s } : unauthorized()
      })
  })

  it('later guards see earlier enrichments in ctx, typed; ordering is enforced', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', schema)
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
    scope(http)
      .extend(standardSchema)
      .validate('params', schema)
      .guard((_app: {}, ctx) => {
        // @ts-expect-error — `admin` is not enriched yet
        return { leaked: ctx.admin }
      })
  })

  it('the leaf sees enrichments + carrier but NEVER the app repos', () => {
    const handler = scope(http)
      .extend(standardSchema)
      .validate('params', schema)
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
    // R, and the intent every guard/leaf here can produce ('status', from
    // unauthorized/forbidden/notFound — all `httpError` underneath) in the
    // markers the adapter reads.
    expectTypeOf(handler).toMatchTypeOf<
      Handler<
        Pick<Repos, 'sessionRepo' | 'adminRepo' | 'courseRepo'>,
        { params: S },
        { title: string },
        { request: RequestHead; params: Readonly<Record<string, string>> },
        never,
        'status'
      >
    >()
  })

  // (each extension's contract lives next to it: `src/extensions/*.test-d.ts`.)

  it('a param-less http scope (no .params) still gets the carrier and requires no app', () => {
    const handler = scope(http).handle((_deps: {}, ctx) => {
      expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
      // @ts-expect-error — repos are not in the ctx bag
      ctx.sessionRepo
      return { pong: true }
    })
    expectTypeOf(handler.__result).toEqualTypeOf<{ pong: boolean } | undefined>()
  })
})

describe('scope() — the carrier-agnostic base', () => {
  it('ctx exposes params ({} — no carrier ever fixed a schema) + enrichments, but NO request and NO cookies', () => {
    scope()
      .guard((_app: {}, ctx) => {
        // no carrier ever fixed a schema, so `params` carries no key
        // @ts-expect-error — `courseId` is not a key of the unit schema's output
        ctx.params.courseId
        // @ts-expect-error — the agnostic base commits to no carrier: no `request`
        ctx.request
        // @ts-expect-error — no `cookies` sink either (it is the `cookies` extension's)
        ctx.response.cookies
        return { seen: true as const }
      })
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.seen).toEqualTypeOf<true>()
        // @ts-expect-error — still no `request` at the leaf
        ctx.request
        return { ok: true }
      })
  })

  it('has no `.params`/`.input` at all — the input channel is a carrier verb', () => {
    // @ts-expect-error — `.params` arrives with `http`, `.input` never existed
    scope().extend(standardSchema).validate('params', schema)
  })

  it('an agnostic scope produces a Handler with Cap = never and Int = never', () => {
    // No carrier ever narrowed `__schema` off the bare `Scope` interface here,
    // so the schema axis stays the wide `StandardSchemaV1` shape (`UnitSchema`
    // is the runtime VALUE `.extend`ing a carrier's `.params` would fix — see
    // `input.test-d.ts` for a scope that does). This test's point is Cap/Int.
    const handler = scope().handle((_deps: {}, _ctx) => ({ id: 'c1' }))
    expectTypeOf(handler.__cap).toEqualTypeOf<((c: never) => never) | undefined>()
    expectTypeOf(handler.__int).toEqualTypeOf<((i: never) => never) | undefined>()
    expectTypeOf(handler.__result).toEqualTypeOf<{ id: string } | undefined>()
  })
})

// The collision gate (§4) covers the BUILDER's own verbs, not only other
// extensions': an extension contributing `guard` would otherwise replace the
// real one at runtime, since extensions mount after the base.
interface HijacksGuard extends Channel {
  readonly __admission: { readonly query: true }
  // A REAL method that redefines a verb the builder owns. The gate reads what
  // the type HAS, so declaring the name alone would no longer say anything.
  guard(g: unknown): unknown
}
declare const hijacksGuard: HijacksGuard & ScopeExtensionValue

interface OwnMethod extends Channel {
  readonly __admission: { readonly query: true }
  sniff(what: string): unknown
}
declare const ownMethod: OwnMethod & ScopeExtensionValue

describe('the collision gate covers the base verbs', () => {
  it('rejects an extension that redefines one, and accepts a name of its own', () => {
    // @ts-expect-error a channel may not redefine a verb the builder owns
    scope(http).extend(hijacksGuard)
    scope(http).extend(ownMethod)
  })
})
