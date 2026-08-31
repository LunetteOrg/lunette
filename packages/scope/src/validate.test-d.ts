import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { RequestHead } from './carrier.ts'
import type { SessionRepo } from './domain.fixture.ts'
import { forbidden, http } from './extensions/http.ts'
import { scope, type Handler } from './scope.ts'
import type { InputOf, OutputOf } from './schema.ts'
import { standardSchema } from './extensions/standard-schema.ts'

// One schema, fixed through `http`'s own `.params` verb.
// `z.coerce.number()` gives an OUTPUT of `number` (the coerced value) from a
// string-ish INPUT — the exact split the host needs: the path provides
// `courseId` as a string, the leaf reads it as a number.
const params = z.object({ courseId: z.coerce.number(), tab: z.string().optional() })
type S = typeof params

describe("http validate('params', schema) — Standard Schema type contract", () => {
  it('OutputOf<S> is the coerced params type; InputOf<S> keeps the raw keys', () => {
    expectTypeOf<OutputOf<S>>().toEqualTypeOf<{ courseId: number; tab?: string | undefined }>()
    expectTypeOf<InputOf<S>>().toMatchTypeOf<{ courseId: unknown }>()
  })

  it('the leaf reads params typed as the schema OUTPUT', () => {
    const h = scope(http)
      .extend(standardSchema)
      .validate('params', params)
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<number>()
        expectTypeOf(ctx.params.tab).toEqualTypeOf<string | undefined>()
        return { id: ctx.params.courseId }
      })
    expectTypeOf(h).toMatchTypeOf<
      Handler<
        Record<never, never>,
        { params: S },
        { id: number },
        { request: RequestHead; params: Readonly<Record<string, string>> }
      >
    >()
    expectTypeOf(h.registry.params).toMatchTypeOf<S>()
  })

  it('a leaf reading a key the schema does not define is a compile error', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', params)
      .handle((_deps: {}, ctx) => {
        // @ts-expect-error — `missing` is not a key of the schema OUTPUT
        return { leaked: ctx.params.missing }
      })
  })

  it('guards read the coerced params too, and later guards see prior enrichments', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', params)
      .guard((deps: { sessionRepo: SessionRepo }, ctx) => {
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<number>()
        const s = deps.sessionRepo.get(ctx.request)
        return s ? { session: s } : forbidden()
      })
      .guard((_deps: {}, ctx) => {
        // the previous guard's enrichment is visible, typed
        expectTypeOf(ctx.session.userId).toEqualTypeOf<string>()
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<number>()
        return { admin: true as const }
      })
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.session.userId).toEqualTypeOf<string>()
        expectTypeOf(ctx.admin).toEqualTypeOf<true>()
        return { ok: true }
      })
  })

  it('a guard reading a params key the schema does not define is a compile error', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', params)
      // @ts-expect-error — `nope` is not a key of the schema OUTPUT
      .guard((_deps: {}, ctx) => ({ x: ctx.params.nope }))
      .handle(() => ({ ok: true }))
  })

  it('the scope accumulates every guard`s app-dep requirement into Need', () => {
    const h = scope(http)
      .extend(standardSchema)
      .validate('params', params)
      .guard((_d: { sessionRepo: SessionRepo }) => ({ a: 1 }))
      .guard((_d: { courseRepo: { size: number } }) => ({ b: 2 }))
      .handle(() => ({ ok: true }))
    // Need is the intersection of both guards' declared deps — carried in __need.
    expectTypeOf(h).toMatchTypeOf<
      Handler<
        { sessionRepo: SessionRepo } & { courseRepo: { size: number } },
        { params: S },
        { ok: boolean },
        { request: RequestHead; params: Readonly<Record<string, string>> }
      >
    >()
  })
})
