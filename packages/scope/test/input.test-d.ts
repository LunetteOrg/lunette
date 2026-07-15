import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { SessionRepo } from './domain.ts'
import { forbidden } from '../src/abort.ts'
import { scope, type Handler } from '../src/scope.ts'
import type { InputOf, OutputOf } from '../src/schema.ts'

// One schema on the scope. `z.coerce.number()` gives an OUTPUT of `number`
// (the coerced value) from a string-ish INPUT — the exact split the host needs:
// the path provides `courseId` as a string, the leaf reads it as a number.
const params = z.object({ courseId: z.coerce.number(), tab: z.string().optional() })
type S = typeof params

describe('scope .input(schema) — Standard Schema type contract', () => {
  it('OutputOf<S> is the coerced params type; InputOf<S> keeps the raw keys', () => {
    expectTypeOf<OutputOf<S>>().toEqualTypeOf<{ courseId: number; tab?: string | undefined }>()
    expectTypeOf<InputOf<S>>().toMatchTypeOf<{ courseId: unknown }>()
  })

  it('the leaf reads params typed as the schema OUTPUT', () => {
    const h = scope()
      .input(params)
      .handle((_deps: {}, ctx) => {
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<number>()
        expectTypeOf(ctx.params.tab).toEqualTypeOf<string | undefined>()
        return { id: ctx.params.courseId }
      })
    expectTypeOf(h).toMatchTypeOf<Handler<Record<never, never>, S, { id: number }>>()
    expectTypeOf(h.schema).toMatchTypeOf<S>()
  })

  it('a leaf reading a key the schema does not define is a compile error', () => {
    scope()
      .input(params)
      .handle((_deps: {}, ctx) => {
        // @ts-expect-error — `missing` is not a key of the schema OUTPUT
        return { leaked: ctx.params.missing }
      })
  })

  it('guards read the coerced params too, and later guards see prior enrichments', () => {
    scope()
      .input(params)
      .guard((deps: { sessionRepo: SessionRepo }, ctx) => {
        expectTypeOf(ctx.params.courseId).toEqualTypeOf<number>()
        const s = deps.sessionRepo.get(new Request('http://x'))
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
    scope()
      .input(params)
      // @ts-expect-error — `nope` is not a key of the schema OUTPUT
      .guard((_deps: {}, ctx) => ({ x: ctx.params.nope }))
      .handle(() => ({ ok: true }))
  })

  it('the scope accumulates every guard`s app-dep requirement into Need', () => {
    const h = scope()
      .input(params)
      .guard((_d: { sessionRepo: SessionRepo }) => ({ a: 1 }))
      .guard((_d: { courseRepo: { size: number } }) => ({ b: 2 }))
      .handle(() => ({ ok: true }))
    // Need is the intersection of both guards' declared deps — carried in __need.
    expectTypeOf(h).toMatchTypeOf<
      Handler<{ sessionRepo: SessionRepo } & { courseRepo: { size: number } }, S, { ok: boolean }>
    >()
  })
})
