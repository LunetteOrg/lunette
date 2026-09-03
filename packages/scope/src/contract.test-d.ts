import { describe, expectTypeOf, it } from 'vitest'
import { scope, type Next, type ResultOf } from './index.ts'
import { answered, badArgs, fixture, refused, type Refusal } from './fixture/carrier.ts'

// THE TYPE CONTRACT, which is what a `*.test-d.ts` file is for in this repo:
// the engine is guaranteed by the runtime tests, and the types guarantee the
// user's world. If a refactor breaks a line here, the refactor is wrong even
// when everything else stays green.
//
// Everything is written with the ONE verb, because that is the claim under
// test: the primitive says all five things a step has to say, and nothing else
// is needed to say them.
//
// NOTHING HERE RUNS, and the file is split so that this is a property of what
// it CONTAINS rather than a rule to remember. A `*.test-d.ts` is typechecked and
// never executed — the config runs `src/**/*.test.ts` and typechecks this
// pattern — so anything written here that reads as execution is not execution.
// Four `expect(...)` calls sat here unexecuted once, reading as coverage, one of
// them the only check that a scope with no leaf THROWS.
//
// The claims that needed a RUN moved to `contract.test.ts`, where they run: they
// were the ones building a scope and awaiting it to name the type of what came
// back, and the await was doing nothing. What is left is type-level throughout —
// conditional types read directly, and refusals under `@ts-expect-error` inside
// functions nobody calls, which is also what keeps a directive from silencing a
// line that would really throw.

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
// `StateOf` and `ResultOf` are how a mount asks what a scope's steps can
// produce, so it can check what its own render path covers. Public and, until
// now, pinned nowhere.
describe('what a scope accumulated, read from outside', () => {
  const s = scope(fixture)
    .step(async (_app: {}, ctx, next: Next<{ user: string }>) =>
      ctx.token === null ? refused('anonymous') : next({ user: ctx.token }),
    )
    .step(async (_app: {}, ctx: { readonly user: string }) => ctx.user.length)

  it('reports every value BESIDE the domain value, and never the marker', () => {
    // `Passed` is machinery: one of these steps hands it back, and it appears
    // in neither branch. What is left is what the steps produced themselves.
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<number | Refusal>()
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

// ── a carrier that declares something unusable fails CLOSED ──────────────────
// The fallback existed and was never exercised. It matters because a carrier
// is hand-written: this is what a typo produces, and the question is whether
// the mistake shows up or spreads.
describe('a carrier declared wrong', () => {
  it('with a non-object `__args`, it is refused at `scope()` — the fallback is unreachable', () => {
    // Better than the fallback firing: the CONSTRAINT catches it first.
    // `Carrier` declares `__args?: object`, so a carrier that got this wrong
    // never reaches `ArgsOf` at all, and the error names the property.
    //
    // Which makes `ArgsOf`'s `T extends object ? T : {}` unreachable through the
    // public API — it can only be entered by a cast or an `any`. Pinned as the
    // dead branch it is, rather than tested as if it were live.
    const refusedCarrier = () => {
      // @ts-expect-error — `__args` must be an object, and `string` is not
      scope(badArgs)
    }
    void refusedCarrier
  })
})

// ── the ctx a step reads is READ-ONLY, whatever the carrier declared ─────────
// `Ctx<S>` used to carry exactly the modifiers the carrier wrote, so a carrier
// that forgot `readonly` handed its steps a mutable ctx and nothing said so.
// That is the wrong side of the split this repo is built on: the engine is
// guaranteed by tests, the types guarantee the USER's world, and a guarantee
// the user has to remember to ask for is not one.
//
// The runtime half of the same question is in `fold.test.ts`, and the two do
// different work: the fold's copy decides what a write REACHES, this decides
// whether it can be written at all.
describe('the ctx a step reads, and what may be written to it', () => {
  it('refuses a write, on a carrier that declared no modifiers of its own', () => {
    const refused = () =>
      scope<{ token: string }>().step(async (_app: {}, ctx, next: Next<{ n: number }>) => {
        // @ts-expect-error ⛔ Cannot assign to 'token' because it is a read-only property
        ctx.token = 'x'
        return next({ n: 1 })
      })
    void refused
  })

  it('and an ANNOTATED mutable shape is not refused, which is the limit', () => {
    // TypeScript does not read `readonly` when it checks assignability, so a
    // step that writes the shape out mutable gets a mutable one. Measured, and
    // pinned as the limit it is rather than left to be discovered: this is a
    // barrier for a step written the ordinary way — with the ctx inferred — and
    // never a wall against one written around it, which is what every other
    // gate in this file is too.
    const allowed = () =>
      scope<{ token: string }>().step(
        async (_app: {}, ctx: { token: string }, next: Next<{ n: number }>) => {
          ctx.token = 'x'
          return next({ n: 1 })
        },
      )
    void allowed
  })
})

// ── the way back is the CARRIER's to protect ────────────────────────────────
// `Ctx` is read-only because the core builds it and therefore knows its type.
// What comes back it does not: `next` returns `Passed`, opaque by construction,
// because when a step is written the steps it wraps do not exist yet. So the
// core has nothing to make read-only, and the guarantee moves to the one place
// where the type IS known — the carrier's single assertion.
//
// The asymmetry is the point, and it is not a gap that was left: what is in
// there is usually the APP's object, alive as long as the process, so a
// decorator writing through it edits the app's own state. A runtime defence was
// weighed and refused — see `answered` and `index.ts` beside `Passed`.
describe('what a decorating step reads on the way out', () => {
  it('is read-only on the domain value that came back', () => {
    // The branch the wrapper is FOR. The domain value is nobody's to declare:
    // it is whatever the leaf produced, and it is usually the APP's object.
    // That is the one this closes, and the one the hazard is about.
    const refused = () =>
      scope(fixture).step(async (_app: {}, _ctx: {}, next: Next<{}>) => {
        const out = answered<{ name: string }>(await next({}))
        // @ts-expect-error ⛔ Cannot assign to 'name' because it is a read-only property
        out.name = 'rewritten'
        return out
      })
    void refused
  })

  it('narrows to each branch, so read-only did not cost the reading', () => {
    // Asserting the annotation back at itself is a tautology — both sides move
    // together and the line can never go red — and this branch has already
    // paid for one test that looked like coverage and was not. So the claim
    // is structural: the member is still REACHABLE, and it keeps its type.
    const check = () =>
      scope(fixture).step(async (_app: {}, _ctx: {}, next: Next<{}>) => {
        const out = answered<{ name: string }>(await next({}))
        expectTypeOf(out).toEqualTypeOf<Readonly<{ name: string }>>()
        return out
      })
    void check
  })
})
