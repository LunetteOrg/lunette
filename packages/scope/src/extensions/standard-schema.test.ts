import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../scope.ts'
import { fixture, refused } from '../fixture/carrier.ts'
import type { Next } from '../step.ts'
import { standardSchema } from './standard-schema.ts'

// VALIDATION — the first real extension, and the one that shows what an
// extension IS. Adding it does nothing to the fold; calling `.validate` is what
// pushes a step. Which is why `.extend` and `.step` are two verbs and not one.

describe('validate refines an entry the scope already holds', () => {
  const page = z.object({ page: z.coerce.number() })

  it('replaces the entry`s type rather than intersecting with it', async () => {
    const h = scope(fixture)
      .extend(standardSchema)
      .step(async (_app: {}, ctx, next: Next<{ query: unknown }>) =>
        next({ query: { page: ctx.params.page ?? '1' } }),
      )
      .validate('query', page)
      .step(async (_app: {}, ctx, _next: Next<{}>) => {
        // REPLACED. Intersecting the raw type with the schema's output is the
        // ordinary refinement, and it gives `never` — a field nobody can use
        // and no error anywhere (§9). The extension writes the override where
        // the override happens.
        expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>()
        return ctx.query.page
      })

    expect(await h({}, { token: null, params: { page: '7' } }).then((o) => o.ok && o.value)).toBe(7)
  })

  it('leaves every other entry alone', () => {
    scope(fixture)
      .extend(standardSchema)
      .validate('params', z.object({ id: z.string() }))
      .step(async (_app: {}, ctx, _next: Next<{}>) => {
        expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(ctx.token).toEqualTypeOf<string | null>()
        return ctx.params.id
      })
  })

  it('stops on the core`s OWN branch when the schema refuses — not on a word', async () => {
    // `invalid` is not an abort: an abort is a word from a carrier's
    // vocabulary and the core has none. Its own branch means a codec that
    // forgets it fails to COMPILE rather than quietly dropping it.
    const h = scope(fixture)
      .extend(standardSchema)
      .validate('params', z.object({ id: z.string().min(4) }))
      .step(async (_app: {}, ctx: { readonly params: { id: string } }) => ctx.params.id)

    const out = await h({}, { token: null, params: { id: 'ab' } })
    expect(out.ok).toBe(false)
    expect(!out.ok && 'invalid' in out && out.invalid.issues.length).toBeGreaterThan(0)
  })

  it('names only the entries this scope has, and says so on a typo', () => {
    const refuse = () => {
      // @ts-expect-error — "nowhere" is not one of this scope's entries
      scope(fixture).extend(standardSchema).validate('nowhere', z.string())
    }
    expect(typeof refuse).toBe('function')
  })

  it('has nothing to validate on a bare scope, and says THAT instead', () => {
    const refuse = () => {
      // @ts-expect-error ⛔ this scope has nothing to validate — did you give it a carrier?
      scope().extend(standardSchema).validate('params', z.string())
    }
    expect(typeof refuse).toBe('function')
  })

  it('composes with the words a carrier coins, in either order', async () => {
    const h = scope(fixture)
      .extend(standardSchema)
      .step(async (_app: {}, ctx, next: Next<{}>) =>
        ctx.token === null ? refused('anonymous') : next({}),
      )
      .validate('params', z.object({ id: z.string() }))
      .step(async (_app: {}, ctx: { readonly params: { id: string } }) => ctx.params.id)

    // the guard runs first, so an anonymous request never reaches the schema
    expect((await h({}, { token: null, params: {} })).ok).toBe(false)
    expect(await h({}, { token: 'ok', params: { id: 'x' } }).then((o) => o.ok && o.value)).toBe('x')
  })
})
