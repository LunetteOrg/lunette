import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope, type Next } from './index.ts'
import { fixture, refused, type Refusal } from './fixture/carrier.ts'

// THE TYPE CONTRACT, in the half that has to RUN — the companion to
// `contract.test-d.ts`, split from it because these claims were pretending.
//
// Each of these builds a scope and awaits it to name the type of what came
// back. In a `*.test-d.ts` that await never happened: the file is typechecked
// and never executed, so the line read as a run and was one only on paper. Here
// it is a run, and the type claim beside it is still checked — by
// `tsc --noEmit`, which reads every file whatever it is called, `expectTypeOf`
// included (measured: a false one is `TS2344`).
//
// Which is why each case now says BOTH things. The type was the only claim
// while the file could not run; the value is what a run is for, and asserting
// only one of them was how four assertions came to sit here proving nothing.

interface Repos {
  readonly users: { readonly byId: (id: string) => { readonly name: string } | undefined }
}

describe('what a scope yields', () => {
  // `R` is READ off the steps, with nothing to declare and nothing to keep
  // aligned. What `next` gave a step contributes no value — that is machinery
  // — so what is left is every domain value a step returned, and it
  // accumulates as a UNION.
  it('accumulates every domain value its steps can return, not just the last', async () => {
    const h = scope(fixture)
      .step(async (app: Repos, ctx, next: Next<{ name: string }>) => {
        const user = app.users.byId(ctx.token ?? '')
        if (!user) return 'anonymous' as const
        return next({ name: user.name })
      })
      .step(async (_app: {}, ctx: { readonly name: string }) => ctx.name.length)

    const out = await h({ users: { byId: () => undefined } }, { token: null, params: {} })
    expect(out).toBe('anonymous')
    // The guard's own value is here. Reading only the closing step missed it —
    // which is what the intersection form could not express at all, since `A &
    // B` over a type that is not a key collapses.
    expectTypeOf(out).toEqualTypeOf<'anonymous' | number>()
  })

  it('a step that stops early contributes its own value, like any other return', async () => {
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{ name: string }>) =>
        ctx.token === null ? refused('anonymous') : next({ name: ctx.token }),
      )
      .step(async (_app: {}, ctx: { readonly name: string }) => ctx.name.length)

    const out = await h({}, { token: 'good', params: {} })
    expect(out).toBe(4)
    // The early value sits in the union beside the domain value. Passing
    // through is what contributes nothing — `Passed` is excluded — and that
    // is the only thing that does.
    expectTypeOf(out).toEqualTypeOf<number | Refusal>()
  })

  // A scope is ALWAYS callable — there is nothing to close. What a base without
  // a leaf has is `R = never`, and `never` has no inhabitant: there is nothing
  // to hand back, so running one throws rather than reporting a bug to its
  // caller as a value.
  it('a scope whose steps all pass through yields `never`', async () => {
    const base = scope<{ readonly id: string }>().step(
      async (_app: {}, ctx, next: Next<{ upper: string }>) => next({ upper: ctx.id }),
    )
    // And this is the case that could not be written honestly before: `never`
    // has no inhabitant, so there is no value to name — the run THROWS, and
    // saying so takes running it. The type half stays beside it.
    const run = () => base({}, { id: 'u1' })
    await expect(run()).rejects.toThrow(/this scope has no leaf/)
    expectTypeOf(await ({} as ReturnType<typeof run>)).toEqualTypeOf<never>()
  })

  // And a base that stops early is not that case at all: its value is a
  // return like any other, so `R` is that value's type and not `never`.
  // `never` means never — a base with a leaf, of any shape, always has a
  // value to hand back.
  it('a base that stops early has `R` = its value, so it never reaches the throw', async () => {
    const base = scope(fixture).step(async (_app: {}, ctx, next: Next<{}>) =>
      ctx.token === null ? refused('anonymous') : next({}),
    )
    const out = await base({}, { token: null, params: {} })
    expect(out).toMatchObject({ kind: 'refused', why: 'anonymous' })
    expectTypeOf(out).toEqualTypeOf<Refusal>()
  })

  // Still a builder, still callable — both at once, which is the whole point of
  // carrying the state in a parameter.
  it('is a builder and the function that runs it at the same time', async () => {
    const s = scope(fixture).step(async (_app: {}, _ctx: {}) => 'v' as const)
    expectTypeOf(s).toHaveProperty('step')
    const out = await s({}, { token: null, params: {} })
    expect(out).toBe('v')
    expectTypeOf(out).toEqualTypeOf<'v'>()
  })
})
