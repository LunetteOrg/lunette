import { z } from 'zod'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { fail, guards, type StandardSchemaV1 } from './index.ts'
import type { BodyOf } from '../reads.ts'

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
    // `AnswerGate` then refuses, at the mount, an `onError` that built
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
  it('reads the output off `validate`, so an OPTIONAL `types` may be absent', () => {
    // The spec marks `types` optional — a carrier for the inference, not a
    // requirement — and every real library fills it in, so reading it there
    // worked until a schema written by hand arrived. Then it is absent, and the
    // entry stayed `unknown`: the validation ran and refined NOTHING, which is
    // the one thing this verb is for, with nothing failing to say so.
    const noTypes = {
      '~standard': {
        version: 1 as const,
        vendor: 'handwritten',
        validate: (value: unknown) => ({ value: value as number }),
      },
    }

    scope<{ readonly n: unknown }>()
      .extend(guards)
      .validate('n', noTypes, () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.n).toEqualTypeOf<number>()
        return ctx.n
      })
  })

  it('and a real library still reads the same way', () => {
    scope<{ readonly body: unknown }>()
      .extend(guards)
      .validate('body', post, () => null)
      .step(async (_a: {}, ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<{ title: string; tags: string[] }>()
        return ctx.body.title
      })
  })

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
  // What this claims is that `.extend` acts on the BUILDER and the CALL acts on
  // the fold — so it has to be read where the fold is, which is what the scope
  // yields. Asserting that the verb is a function said nothing: it holds
  // whatever `.extend` did.
  const bare = scope<{ readonly token: string }>()
  const extended = bare.extend(guards)

  it('extending changes nothing the fold hands back', () => {
    expectTypeOf(extended).returns.resolves.toEqualTypeOf<
      Awaited<ReturnType<typeof bare>>
    >()
  })

  it('and calling a verb is what changes it', () => {
    const grown = extended.guard(
      (_a: {}, { token }) => (token ? { actor: token } : fail()),
      () => 'stopped' as const,
    )

    expectTypeOf(grown).returns.resolves.toEqualTypeOf<'stopped'>()
  })
})

describe('`BodyOf` says what the encoding was, and `unknown` when it was not said', () => {
  it('narrows on a literal', () => {
    expectTypeOf<BodyOf<'json'>>().toEqualTypeOf<unknown>()
    expectTypeOf<BodyOf<'form'>>().toEqualTypeOf<Record<string, string | File>>()
  })

  it('is `unknown` for a caller that did not say which — the lattice, not a bug', () => {
    // A wrapper over `body(encoding, onError)` infers `E` as the whole union, and
    // gets `unknown`. That is not a narrowing lost to a distributing conditional:
    // `unknown` IS the json branch, and a union containing `unknown` is
    // `unknown`, whatever the conditional does. Distributing and tupling give the
    // same answer — measured, both forms.
    //
    // Written as an equality on purpose. The assertions this replaced were
    // `not.toEqualTypeOf<never>()` and a `toMatchTypeOf`, and both hold for
    // `unknown` — they passed for the type they were written to catch, which is
    // the one thing a type test must not do.
    expectTypeOf<BodyOf<'json' | 'form'>>().toEqualTypeOf<unknown>()
  })
})
