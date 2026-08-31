import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope } from './scope.ts'
import { fixture, refused } from './fixture/carrier.ts'
import { type Next } from './step.ts'

// The type contract of the base builder. Everything here is written with the
// ONE verb, because that is the claim under test: the primitive says all five
// things a step has to say, and nothing else is needed to say them.

interface Repos {
  readonly users: { readonly byId: (id: string) => { readonly name: string } | undefined }
}

describe('what a step reads', () => {
  it('is contextually typed by what the scope holds — parameters need no annotation', () => {
    scope<{ readonly id: string }>()
      .step(async (_app: {}, ctx, next: Next<{ upper: string }>) => {
        expectTypeOf(ctx.id).toEqualTypeOf<string>()
        return next({ upper: ctx.id.toUpperCase() })
      })
      .step(async (_app: {}, ctx, next: Next<{}>) => {
        // what the step before it populated, typed, with nothing declared twice
        expectTypeOf(ctx.upper).toEqualTypeOf<string>()
        expectTypeOf(ctx.id).toEqualTypeOf<string>()
        return next({})
      })
  })

  it('refuses a step that reads a key no earlier step populated', () => {
    scope<{ readonly id: string }>().step(async (_app: {}, ctx, next: Next<{}>) => {
      // @ts-expect-error — nothing populated `name`
      ctx.name
      return next({})
    })
  })

  // THE LOCK, and it is not a rule the core enforces — it is a shape that
  // cannot be written. Under `strictFunctionTypes` a function-typed parameter
  // is contravariant, so a step ANNOTATING a ctx wider than the scope holds
  // fails at the argument, naming the member that is missing. This is what
  // replaces an alphabet of transport features at the definition site.
  it('refuses a step that ANNOTATES a wider ctx than the scope holds', () => {
    scope<{ readonly request: { readonly url: string } }>().step(
      // @ts-expect-error — the scope's request has no `arrayBuffer` to read
      async (
        _app: {},
        _ctx: { readonly request: { readonly url: string; arrayBuffer(): Promise<ArrayBuffer> } },
        next: Next<{}>,
      ) => next({}),
    )
  })
})

describe('what a step populates', () => {
  // The measured surprise: `Add` occurs ONLY in a parameter position of `next`,
  // so it is not inferable from the `next(...)` calls in the body. Annotating
  // the parameter IS the declaration, and leaving it bare declares nothing.
  it('is read from the ANNOTATED `next`, and an unannotated one populates nothing', () => {
    scope()
      .step(async (_app: {}, _ctx, next) => next({ ghost: 1 }))
      .step(async (_app: {}, ctx, next: Next<{}>) => {
        // @ts-expect-error — `next` was not annotated, so nothing was declared
        ctx.ghost
        return next({})
      })
  })
})

describe('what a scope yields', () => {
  // `R` is READ off the steps, with nothing to declare and nothing to keep
  // aligned. Two of the three things a step can return contribute no value —
  // the outcome `next` gave it, and a WORD — so what is left is the domain
  // value, and it accumulates as a UNION.
  it('accumulates every domain value its steps can return, not just the last', async () => {
    const h = scope(fixture)
      .step(async (app: Repos, ctx, next: Next<{ name: string }>) => {
        const user = app.users.byId(ctx.token ?? '')
        if (!user) return 'anonymous' as const
        return next({ name: user.name })
      })
      .step(async (_app: {}, ctx: { readonly name: string }) => ctx.name.length)

    const out = await h({ users: { byId: () => undefined } }, { token: null, params: {} })
    // The guard's own value is here. Reading only the closing step missed it —
    // which is what the intersection form could not express at all, since `A &
    // B` over a type that is not a key collapses.
    if (out.ok) expectTypeOf(out.value).toEqualTypeOf<'anonymous' | number>()
  })

  it('a step that passes through or says a WORD contributes no value', async () => {
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{ name: string }>) =>
        ctx.token === null ? refused('anonymous') : next({ name: ctx.token }),
      )
      .step(async (_app: {}, ctx: { readonly name: string }) => ctx.name.length)

    const out = await h({}, { token: 'good', params: {} })
    if (out.ok) expectTypeOf(out.value).toEqualTypeOf<number>()
  })

  // A scope is ALWAYS callable — there is nothing to close. What a base without
  // a leaf has is `R = never`, and `never` has no inhabitant: there is no `ok`
  // outcome to hand back, so running one throws rather than reporting a bug to
  // its caller as a success.
  it('a scope whose steps all pass through yields `never`, and running it throws', async () => {
    const base = scope<{ readonly id: string }>().step(
      async (_app: {}, ctx, next: Next<{ upper: string }>) => next({ upper: ctx.id }),
    )
    const thrown = await base({}, { id: 'u1' }).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(Error)

    const typed = async () => {
      const o = await base({}, { id: 'u1' })
      if (o.ok) expectTypeOf(o.value).toEqualTypeOf<never>()
    }
    expect(typeof typed).toBe('function')
  })

  // `Outcome<never>` is NOT empty: the other two branches stay inhabited, so a
  // base that refuses has a perfectly good outcome and never reaches the throw.
  it('a base that refuses hands back its word, `R = never` notwithstanding', async () => {
    const base = scope(fixture).step(async (_app: {}, ctx, next: Next<{}>) =>
      ctx.token === null ? refused('anonymous') : next({}),
    )
    const out = await base({}, { token: null, params: {} })
    expect(out.ok).toBe(false)
  })

  // Still a builder, still callable — both at once, which is the whole point of
  // carrying the state in a parameter.
  it('is a builder and the function that runs it at the same time', async () => {
    const s = scope(fixture).step(async (_app: {}, _ctx: {}) => 'v' as const)
    expectTypeOf(s).toHaveProperty('step')
    const out = await s({}, { token: null, params: {} })
    if (out.ok) expectTypeOf(out.value).toEqualTypeOf<'v'>()
  })
})

describe('what a step knows of the app', () => {
  it('accumulates into what the call demands, and a chain missing it is refused', () => {
    const h = scope<{ readonly id: string }>()
      .step(async (_app: Repos, _ctx, next: Next<{}>) => next({}))
      .step(async (_app: {}, _ctx: {}) => 'done')

    h({ users: { byId: () => undefined } }, { id: 'u1' })
    // @ts-expect-error — the chain does not expose `users`
    h({ other: true }, { id: 'u1' })
  })

  it('types the scope execution parameters, so passing the wrong key names it', () => {
    const h = scope<{ readonly id: string }>().step(
      async (_app: {}, _ctx: { readonly id: string }) => 'done',
    )
    // @ts-expect-error — the run brings `id`, not `courseId`
    h({}, { courseId: 'c1' })
  })
})
