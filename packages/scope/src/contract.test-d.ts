import { describe, expectTypeOf, it } from 'vitest'
import { scope, type IntentsOf, type Next, type ResultOf } from './index.ts'
import { elsewhere, fixture, refused, type Elsewhere, type Refusal } from './fixture/carrier.ts'

// THE TYPE CONTRACT, which is what a `*.test-d.ts` file is for in this repo:
// the engine is guaranteed by the runtime tests, and the types guarantee the
// user's world. If a refactor breaks a line here, the refactor is wrong even
// when everything else stays green.
//
// Everything is written with the ONE verb, because that is the claim under
// test: the primitive says all five things a step has to say, and nothing else
// is needed to say them.
//
// NO RUNTIME ASSERTIONS BELONG HERE, and that is a rule with teeth rather than
// a preference: a `*.test-d.ts` file is TYPECHECKED and never RUN — the config
// includes `src/**/*.test.ts` for tests and this pattern only for typecheck. An
// `expect(...)` in this file is dead code that reads as coverage, and four of
// them sat here unexecuted, one of them the only check that a scope with no
// leaf THROWS. `suite.test.ts` now fails if any come back.

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
    expectTypeOf(out).toEqualTypeOf<'anonymous' | number>()
  })

  it('a step that says a WORD contributes it, like any other return', async () => {
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{ name: string }>) =>
        ctx.token === null ? refused('anonymous') : next({ name: ctx.token }),
      )
      .step(async (_app: {}, ctx: { readonly name: string }) => ctx.name.length)

    const out = await h({}, { token: 'good', params: {} })
    // The word is in the union beside the domain value. Passing through is what
    // contributes nothing — `Passed` is excluded — and that is the only thing
    // that does (§42).
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
    const o = await base({}, { id: 'u1' })
    expectTypeOf(o).toEqualTypeOf<never>()
  })

  // And a base that REFUSES is not that case at all: its word is a return like
  // any other, so `R` is the word's type and not `never`. The two-branch shape
  // needed a caveat here — `Outcome<never>` was not empty, because the abort
  // branch stayed inhabited — and with one channel the caveat is gone: `never`
  // means never (§42).
  it('a base that refuses has `R` = its word, so it never reaches the throw', async () => {
    const base = scope(fixture).step(async (_app: {}, ctx, next: Next<{}>) =>
      ctx.token === null ? refused('anonymous') : next({}),
    )
    const out = await base({}, { token: null, params: {} })
    expectTypeOf(out).toEqualTypeOf<Refusal>()
  })

  // Still a builder, still callable — both at once, which is the whole point of
  // carrying the state in a parameter.
  it('is a builder and the function that runs it at the same time', async () => {
    const s = scope(fixture).step(async (_app: {}, _ctx: {}) => 'v' as const)
    expectTypeOf(s).toHaveProperty('step')
    const out = await s({}, { token: null, params: {} })
    expectTypeOf(out).toEqualTypeOf<'v'>()
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

// ── what a scope tells anything OUTSIDE the builder ──────────────────────────
// `StateOf` and its two readers are how a mount asks what a scope accumulated,
// and they are the demand side of the intent axis: the supply gate asks whether
// the CARRIER coins a word, and these answer what the STEPS actually say. A
// mount is checked against the second, so a host that cannot render one of them
// fails to compile rather than degrading at runtime.
//
// Public and, until now, pinned nowhere — which mattered because §42 changed
// what `ResultOf` means: it used to be the domain side only, and it is now
// everything a step hands back.
describe('what a scope accumulated, read from outside', () => {
  const s = scope(fixture)
    .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
      ctx.token === null ? refused('anonymous') : next({ user: ctx.token }),
    )
    .step(async (_app: {}, ctx: { readonly user: string }, next: Next<{}>) =>
      ctx.user === 'moved' ? elsewhere('/here') : next({}),
    )
    .step(async (_app: {}, ctx: { readonly user: string }) => ctx.user.length)

  it('reports every word its steps can say, accumulated across all of them', () => {
    // TWO names from three steps: the leaf says none, and the two guards say
    // one each. A mount asks exactly this question.
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'refusal' | 'elsewhere'>()
  })

  it('reports the words BESIDE the domain value, and never the marker', () => {
    // `Passed` is machinery: two of these steps hand it back, and it appears in
    // neither reader. What is left is what the steps produced themselves.
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<number | Refusal | Elsewhere>()
  })

  it('a scope that says nothing demands nothing of a host', () => {
    // The agnostic case: no carrier, no words, so no host can fail to render
    // them — which is why a bare `scope()` mounts anywhere.
    const silent = scope().step(async (_app: {}, _ctx: {}) => 'just a value')
    expectTypeOf<IntentsOf<typeof silent>>().toEqualTypeOf<never>()
    expectTypeOf<ResultOf<typeof silent>>().toEqualTypeOf<string>()
  })

  it('a base with no leaf produces nothing, and says so', () => {
    const base = scope(fixture).step(async (_app: {}, _ctx, next: Next<{ x: 1 }>) => next({ x: 1 }))
    expectTypeOf<ResultOf<typeof base>>().toEqualTypeOf<never>()
  })
})

// ── the marker excludes the fold's answer, and NOTHING else ──────────────────
// `ValueOf` is `Exclude<R, Passed>`, so what `Passed` matches decides what a
// scope is allowed to say it produces. It matched too much: written with an
// OPTIONAL member it was a weak type, and `R extends Passed` then holds for any
// type that COULD carry the key — which an index signature can.
//
// The failure was silent in the worst way. A leaf returning `Record<string,
// number>` — a tally, a bag of headers, a wide typed row — was excluded, the
// scope declared `never`, and `never` is assignable to everything: every
// consumer downstream compiled and got at runtime a value the types had called
// impossible. Pinned here because nothing about it is visible at the call site.
describe('what the marker excludes', () => {
  it('does not eat a leaf whose value has an index signature', () => {
    const tally = scope(fixture).step(
      async (_app: {}, _ctx: {}) => ({ hits: 1 }) as Record<string, number>,
    )
    expectTypeOf<ResultOf<typeof tally>>().toEqualTypeOf<Record<string, number>>()

    const bag = scope(fixture).step(async (_app: {}, _ctx: {}) => ({}) as object)
    expectTypeOf<ResultOf<typeof bag>>().toEqualTypeOf<object>()
  })

  it('still excludes what it is FOR — a step that only passes through', () => {
    // the whole point of the marker: this scope produces nothing of its own
    const base = scope(fixture).step(async (_app: {}, _ctx, next: Next<{ x: 1 }>) => next({ x: 1 }))
    expectTypeOf<ResultOf<typeof base>>().toEqualTypeOf<never>()
  })
})
