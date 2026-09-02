import { describe, expectTypeOf, it } from 'vitest'
import {
  scope,
  type AnyStep,
  type Extension,
  type IntentsOf,
  type Next,
  type ResultOf,
  type Scope,
  type State,
  type Surface,
  type Word,
} from './index.ts'
import {
  answered,
  badArgs,
  badVocab,
  elsewhere,
  fixture,
  refused,
  refused as refusedWord,
  served,
  type Elsewhere,
  type Refusal,
  type Served,
} from './fixture/carrier.ts'

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

// ── the phantom's INVARIANCE, which nothing was attacking ────────────────────
// `Word<I>` carries `__i?: (i: I) => I`, with `I` in both the parameter and the
// return position, and the comment beside it says why: a contravariant phantom
// would let a caller name the gate away by supplying `never`. That claim was
// stated and never tested — a regression to `() => I` or to `(i: I) => void`
// would have compiled clean and taken a lock off with it.
//
// Four directions, because variance in either direction opens exactly one of
// them: measured by making the phantom co- and contravariant in turn, and each
// change unlocks one line below and no more.
describe('two words with different names are unrelated', () => {
  type A = { readonly refusal: true }
  type B = { readonly elsewhere: true }

  it('neither stands in for the other, in either direction', () => {
    const wa = null as unknown as Word<A>
    const wb = null as unknown as Word<B>
    // @ts-expect-error — a refusal is not an elsewhere
    const _x: Word<B> = wa
    // @ts-expect-error — nor the other way round
    const _y: Word<A> = wb
    void _x
    void _y
  })

  it('and a word that names NOTHING cannot stand in for one that does', () => {
    // The case the comment names. `Word<never>` is what a caller reaches for to
    // make the gate stop asking; invariance is what makes it useless for that.
    const wn = null as unknown as Word<never>
    const wa = null as unknown as Word<A>
    // @ts-expect-error — an undeclared word is not a declared one
    const _z: Word<A> = wn
    // @ts-expect-error — and a declared one is not undeclared
    const _w: Word<never> = wa
    void _z
    void _w
  })
})

// ── a carrier that declares something unusable fails CLOSED ──────────────────
// Both fallbacks existed and neither was exercised. They matter because a
// carrier is hand-written: these are what a typo produces, and the question is
// whether the mistake shows up or spreads.
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

  it('with a non-string vocabulary key, it coins nothing and every word is refused', () => {
    // This one IS reachable — a symbol-keyed vocabulary satisfies `object` — and
    // the branch was dead in the suite until now.
    //
    // What is pinned is FAIL-CLOSED: the carrier coins nothing, so every word is
    // refused. What is NOT pinned is the sentinel itself — replacing
    // `'__NON_STRING_DECLARED_KEY'` with `never` also refuses everything, and a
    // `@ts-expect-error` cannot read the message to tell them apart. The
    // sentinel earns its place by what the error SAYS, and that is not
    // expressible here; measured by making the swap and watching nothing go red.
    const refused = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: refusal
      scope(badVocab).step(async (_app: {}, _ctx: {}) => refusedWord('no'))
    }
    void refused
  })
})

// ── a verb that SAYS a word has to declare it ────────────────────────────────
// The one place the accumulation above is not automatic, and it is worth
// pinning because the verbs that will exercise it are the ones being written
// next.
//
// `.step` states what a step returns twice over: `ReturnGate<S, Ret>` refuses a
// word the carrier does not coin, and `Grown` puts `Awaited<Ret>` into
// `returns`, which is what `IntentsOf` reads. A verb goes through neither.
// `Extension`'s factories are typed `(...args: never[]) => AnyStep`, so the
// step's return type is erased before the core could look at it, and
// `.extend`'s wrapper pushes the step directly.
//
// That bypass is DELIBERATE on the ctx axis — it is what lets a verb REPLACE an
// entry where `CtxGate` refuses (see `verbs.test.ts`) — and the return axis
// comes along with it. So the declared signature is the only statement of what
// a verb produces, and the rule is: a verb whose step returns a word writes
// that word into `returns` itself.
const refuse = () => async (_app: {}, _ctx: {}, _next: Next<{}>) => refused('by a verb')

interface DeclaringVerb {
  // `S['returns'] | Refusal` — the word's own type, unioned onto what the scope
  // already says. This is the line the rule is about.
  refuse<S extends State>(
    this: Scope<S>,
  ): Surface<{
    need: S['need']
    args: S['args']
    acc: S['acc']
    returns: S['returns'] | Refusal
    vocabulary: S['vocabulary']
    verbs: S['verbs']
  }>
}

interface SilentVerb {
  // The same factory, declared as a pass-through — which is what every verb
  // that does NOT produce a word correctly says, and what copying one of those
  // leaves behind.
  refuse<S extends State>(
    this: Scope<S>,
  ): Surface<{
    need: S['need']
    args: S['args']
    acc: S['acc']
    returns: S['returns']
    vocabulary: S['vocabulary']
    verbs: S['verbs']
  }>
}

const declaring: Extension<DeclaringVerb> = {
  methods: { refuse: refuse as unknown as (...a: never[]) => AnyStep },
}

const silent: Extension<SilentVerb> = {
  methods: { refuse: refuse as unknown as (...a: never[]) => AnyStep },
}

describe('a verb declares the words it says, because nothing computes them', () => {
  it('one that declares its word is read by a mount exactly like a step`s', () => {
    const s = scope(fixture)
      .extend(declaring)
      .refuse()
      .step(async (_app: {}, _ctx: {}) => 'served')

    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'refusal'>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<string | Refusal>()
  })

  it('one that omits it is INVISIBLE to a mount, and the word still arrives', () => {
    // The hole, pinned as a hole rather than left to be discovered by whoever
    // writes the next carrier. Same factory, same runtime — the scope really
    // does hand back a `Refusal` — and the reader says `never`, so a host that
    // cannot render a refusal mounts this without a word of complaint.
    //
    // The core cannot close it: with the factory's return type erased at the
    // `Extension` boundary, there is nothing here to compare the declaration
    // against. If it is ever closed it will be by a verb declaring its step's
    // type, and this line is what goes red when that lands.
    const s = scope(fixture)
      .extend(silent)
      .refuse()
      .step(async (_app: {}, _ctx: {}) => 'served')

    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<never>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<string>()
  })
})

// ── the ctx a step reads is READ-ONLY, whatever the carrier declared ─────────
// `Ctx<S>` used to carry exactly the modifiers the carrier wrote, so a carrier
// that forgot `readonly` handed its steps a mutable ctx and nothing said a
// word. That is the wrong side of the split this repo is built on: the engine
// is guaranteed by tests, the types guarantee the USER's world, and a guarantee
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
  it('is read-only on the DOMAIN value, which the words already were on their own', () => {
    // The branch the wrapper is FOR. A carrier's words declare their own
    // members `readonly` — `Served` does, three lines of the fixture — so they
    // were covered before `answered` existed. The domain value is nobody's to
    // declare: it is whatever the leaf produced, and it is usually the APP's
    // object. That is the one this closes, and the one the hazard is about.
    const refused = () =>
      scope(fixture).step(async (_app: {}, _ctx: {}, next: Next<{}>) => {
        const out = answered<{ name: string }>(await next({}))
        if (typeof out === 'object' && out !== null && 'name' in out) {
          // @ts-expect-error ⛔ Cannot assign to 'name' because it is a read-only property
          out.name = 'rewritten'
        }
        return out
      })
    void refused
  })

  it('reads as the carrier`s words BESIDE the domain value, which is what one channel means', () => {
    const check = () =>
      scope(fixture).step(async (_app: {}, _ctx: {}, next: Next<{}>) => {
        const out = answered<number>(await next({}))
        expectTypeOf(out).toEqualTypeOf<Readonly<Refusal | Elsewhere | Served<number> | number>>()
        return served(1, 'here')
      })
    void check
  })
})
