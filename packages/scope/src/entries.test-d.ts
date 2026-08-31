import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { RequestHead } from './carrier.ts'
import { scope } from './scope.ts'
import type { Channel } from './scope.ts'
import { body } from './extensions/body.ts'
import { http } from './extensions/http.ts'
import { query } from './extensions/query.ts'
import { requestCookies } from './extensions/request-cookies.ts'
import { requestHeaders } from './extensions/request-headers.ts'
import { rpc } from './extensions/trpc.ts'
import { standardSchema } from './extensions/standard-schema.ts'

// The input axis: extensions POPULATE ctx entries, `validate` REFINES one.
// This file pins the half that is easy to get wrong and impossible to notice —
// what a scope has to point `validate` at, and what happens to the entry's TYPE
// once a schema runs over it.

describe('an extension populates its entry, readable with no schema', () => {
  it('gives the raw shape the source actually carries', () => {
    scope(http)
      .extend(query)
      .extend(requestHeaders)
      .extend(requestCookies)
      .handle((_d: {}, ctx) => {
        // A query string carries strings, and repeated keys carry arrays.
        expectTypeOf(ctx.query).toEqualTypeOf<Readonly<Record<string, string | string[]>>>()
        // A header read needs no schema to be useful: this is the guard shape a
        // bearer-token check has, with nothing declared. `string | undefined`
        // and not `string`, because the header may simply be absent — the
        // record is indexed, and `noUncheckedIndexedAccess` says so. Validating
        // the entry is how a guard stops handling the absent case.
        expectTypeOf(ctx.headers.authorization).toEqualTypeOf<string | undefined>()
        expectTypeOf(ctx.cookies).toEqualTypeOf<Readonly<Record<string, string>>>()
        // The carrier's own entry, unvalidated: route params are strings.
        expectTypeOf(ctx.params).toEqualTypeOf<Readonly<Record<string, string>>>()
        expectTypeOf(ctx.request).toEqualTypeOf<RequestHead>()
        return {}
      })
  })
})

// THE regression this file exists for (trap 9). `Ctx` is assembled from the
// populated entries and the accumulated `__acc`, and `validate` lands its output
// in `__acc` under the SAME key. Assembled as a plain intersection, refining
// `query` to `{ page: number }` yields `(string | string[]) & number` — that is
// `never`, with no error anywhere: a field nobody can use, diagnosed wherever it
// is finally read, in a different file. `Omit` first, then intersect.
//
// The body case survives a plain intersection by accident (`unknown & X` is
// `X`), which is exactly what would let this ship unnoticed — so both are
// asserted, and the query one is the load-bearing assertion.
describe('validate refines the entry in place', () => {
  it('replaces the raw type rather than intersecting with it', () => {
    scope(http)
      .extend(query)
      .extend(standardSchema)
      .validate('query', z.object({ page: z.coerce.number() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.query.page).toEqualTypeOf<number>()
        // and NOT `never`, which is what the intersection produced
        expectTypeOf(ctx.query.page).not.toEqualTypeOf<never>()
        return {}
      })
  })

  it('refines the body entry too, where an intersection would have looked fine', () => {
    scope(http)
      .extend(body('json'))
      .extend(standardSchema)
      .validate('body', z.object({ title: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>()
        return {}
      })
  })

  it('refines the carrier`s own entry the same way', () => {
    scope(http)
      .extend(standardSchema)
      .validate('params', z.object({ postId: z.string() }))
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.params.postId).toEqualTypeOf<string>()
        // @ts-expect-error — the schema decides the keys once it has run
        ctx.params.nope
        return {}
      })
  })
})

describe('the name `validate` takes', () => {
  it('is refused when the scope has no such entry, and the valid ones are named', () => {
    // @ts-expect-error — `"query"` is not assignable to `"params"`: no query channel
    scope(http).extend(standardSchema).validate('query', z.object({ page: z.string() }))
  })

  it('is refused on a bare scope with a sentence, since `never` names nothing', () => {
    // @ts-expect-error — ⛔ this scope has nothing to validate — did you give it a carrier?
    scope().extend(standardSchema).validate('params', z.object({ postId: z.string() }))
  })

  it('is accepted for every entry the scope really has', () => {
    scope(http)
      .extend(query)
      .extend(standardSchema)
      .validate('params', z.object({ postId: z.string() }))
      .validate('query', z.object({ page: z.coerce.number() }))
      .handle((_d: {}, ctx) => ({ id: ctx.params.postId, page: ctx.query.page }))
  })

  it('names the carrier`s own entry, which differs per carrier', () => {
    scope(rpc).extend(standardSchema).validate('input', z.object({ id: z.string() }))
    // @ts-expect-error — `params` is HTTP's name for it; tRPC has `input`
    scope(rpc).extend(standardSchema).validate('params', z.object({ id: z.string() }))
    // @ts-expect-error — and the reverse: HTTP has no `input`
    scope(http).extend(standardSchema).validate('input', z.object({ id: z.string() }))
  })
})

// A channel does not have to be about the transport. One that concerns the FOLD
// asks for nothing, composes on a bare `scope()`, and is the same mechanism
// pointed elsewhere (#55). `__admission` stays REQUIRED so an omission is still
// a compile error; `{}` is a deliberate statement, which is a different thing.
interface FoldChannel extends Channel {
  readonly __admission: {}
  readonly __ctx?: { readonly span: { setAttribute(k: string, v: string): void } }
}
declare const trace: FoldChannel

describe('a carrier-free channel', () => {
  it('composes on a bare scope, and on every carrier', () => {
    scope()
      .extend(trace)
      .handle((_d: {}, ctx) => {
        ctx.span.setAttribute('x', 'y')
        return {}
      })
    scope(http).extend(trace).handle(() => ({}))
    // tRPC admits one feature and this asks for none, so it lands there too
    scope(rpc).extend(trace).handle(() => ({}))
  })

  it('does not open the gate for a channel that DOES ask for something', () => {
    // @ts-expect-error — ⛔ this carrier has no body to speak of
    scope(rpc).extend(body('json'))
  })
})

describe('a bare scope', () => {
  it('has no entries and no carrier ctx at all', () => {
    scope()
      .guard((_d: {}, ctx) => {
        // @ts-expect-error — no carrier, so no `params`
        ctx.params
        // @ts-expect-error — and no `request`
        ctx.request
        return { seen: true as const }
      })
      .handle((_d: {}, ctx) => {
        expectTypeOf(ctx.seen).toEqualTypeOf<true>()
        return { ok: true }
      })
  })
})
