import { z } from 'zod'
import { describe, expectTypeOf, it } from 'vitest'
import { scope, type Next } from '../index.ts'
import { fail, guards, type StandardSchemaV1 } from './index.ts'

// THE TYPE CONTRACT for the three verbs. NOTHING HERE RUNS: a `*.test-d.ts` is
// typechecked and never executed, and the refusals sit under `@ts-expect-error`.

const post = z.object({ title: z.string(), tags: z.array(z.string()) })

describe('what each verb does to the ctx', () => {
  it('`guard` ADDS what the check returned, typed, with the name deduced', () => {
    scope<{ readonly token: string | null }>()
      .extend(guards)
      .guard((_a: {}, { token }) => (token === null ? fail() : { actor: token }), () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.actor).toEqualTypeOf<string>()
        return ctx.actor
      })
  })

  it('`refine` REPLACES, so the entry changes type rather than intersecting', () => {
    scope<{ readonly n: string }>()
      .extend(guards)
      .refine('n', (_a: {}, { n }) => Number(n), () => null)
      .step(async (_a: {}, ctx) => {
        // `string & number` would be `never` — assignable to everything and
        // complained about nowhere. This is the whole reason a verb exists.
        expectTypeOf(ctx.n).toEqualTypeOf<number>()
        return ctx.n
      })
  })

  it('`validate` refines to the SCHEMA\'s output, which is its whole job', () => {
    scope<{ readonly body: unknown }>()
      .extend(guards)
      .validate('body', post, () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string; tags: string[] }>()
        return ctx.body.title
      })
  })
})

describe('`guard` may only ADD, and says so', () => {
  const h = scope<{}>()
    .extend(guards)
    .guard(() => ({ actor: 'a' }), () => null)

  it('refuses a second guard landing on the same key', () => {
    // Without this the two would INTERSECT: `string & string` survives here,
    // but `string & number` is `never` — assignable to everything, caught
    // nowhere, while the runtime hands back the second value.
    // @ts-expect-error ⛔ this ctx key is already populated: actor
    h.guard(() => ({ actor: 'b' }), () => null)
  })

  it('and points at the verb that DOES replace, which then compiles', () => {
    h.refine('actor', () => 'b', () => null)
  })
})

describe('`refine` and `validate` name an entry the ctx already holds', () => {
  it('refuses a name nothing populated — that is an addition, and `guard`\'s job', () => {
    // @ts-expect-error — 'nope' is not a key of this ctx
    scope<{ readonly body: unknown }>().extend(guards).refine('nope', () => 1, () => null)
  })

  it('accepts a key the RUN brought, not only one a step derived', () => {
    // An entry either ARRIVES in the execution parameters or is DERIVED, and
    // both are refinable: `Ctx` resolves the args axis with an `Omit` already.
    scope<{ readonly params: Record<string, string> }>()
      .extend(guards)
      .refine('params', (_a: {}, { params }) => ({ id: params.id ?? '' }), () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>()
        return ctx.params.id
      })
  })
})

describe('what `onError` costs and buys', () => {
  it('joins the RETURNS union, which is what a host mount reads', () => {
    // `AnswerGate` (§44) then refuses, at the mount, an `onError` that built
    // something the host will never send — no gate of this extension's own.
    const h = scope<{ readonly body: unknown }>()
      .extend(guards)
      .validate('body', post, () => 'invalid' as const)
      .guard(() => ({ ok: true }), () => 401 as const)
      .step(async (_a: {}, ctx) => ctx.body.title)

    expectTypeOf(h).returns.resolves.toEqualTypeOf<string | 'invalid' | 401>()
  })

  it('reads the ctx, which is how it answers in the host\'s own door', () => {
    scope<{
      readonly body: unknown
      readonly res: { status(n: number): { json(b: unknown): 'sent' } }
    }>()
      .extend(guards)
      .validate('body', post, (issues, { res }) => res.status(422).json({ issues }))
      .step(async (_a: {}, ctx) => ctx.body.title)
  })
})

describe('a guard declares what it needs of the app, as a step does', () => {
  it('accumulates `need`, so an unsatisfied chain is refused at the call', () => {
    const h = scope<{}>()
      .extend(guards)
      .guard(({ db }: { readonly db: string }) => ({ found: db }), () => null)
      .step(async (_a: {}, ctx) => ctx.found)

    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    void h({}, {})
    void h({ db: 'pg' }, {})
  })
})

describe('the inlined spec is satisfied structurally', () => {
  it('accepts a hand-written schema, and reads its output type', () => {
    const evenNumber: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'handwritten',
        validate: (value) =>
          typeof value === 'number' && value % 2 === 0
            ? { value }
            : { issues: [{ message: 'not an even number' }] },
      },
    }

    scope<{ readonly n: unknown }>()
      .extend(guards)
      .validate('n', evenNumber, () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.n).toEqualTypeOf<number>()
        return ctx.n
      })
  })
})

describe('the extension is added, never stepped', () => {
  it('a verb call is what grows the fold', () => {
    const bare = scope<{}>().extend(guards)
    expectTypeOf(bare.guard).toBeFunction()
    // pinned at runtime in `index.test.ts`: `.extend` adds no step
    void (async (_a: {}, _c: {}, next: Next<{}>) => next({}))
  })
})
