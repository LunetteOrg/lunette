// The compile-time collision guard: the verbs REJECT the argument that
// repeats a top-level key already present in the context. The diagnostic
// lands on the exact colliding line and names the key in the message
// value (collision-guard-dx.test-d.ts is the evidence record with the
// verbatim tsc output; the decision is discussion #21). The chain keeps
// typing downstream — the accepted trade: the collided key's accumulated
// type is transiently wrong (an intersection the runtime would never
// produce) until the collision is fixed; the build stays red at the
// collision, so no green program ever lies.

import { describe, expectTypeOf, it } from 'vitest'
import { lunette, type Lunette } from '../../src/index.ts'

declare const anyPubFrag: Lunette<{}, any, {}>
// The real message types, imported so this contract cannot drift from
// the text chain.ts actually prints (they are type-only and not part of
// the public index.ts surface).
import type {
  AnyCtxMsg,
  AnyPatchMsg,
  Clash,
  CollisionBrand,
  DupKeyMsg,
  NeverCtxMsg,
  NeverPatchMsg,
  NumKeyMsg,
  NumKeys,
  WidenedPatchMsg,
} from '../../src/chain.ts'

// Reads the message VALUE out of a brand object without naming its
// private symbol key — the wiring pin for the argument-side messages,
// which no chain-level assertion can reach (the brand rejects the
// argument; the chain type never carries it).
type BrandMsg<B> = B[keyof B]

// A user-side unique symbol named like the brand: same name, different
// identity — used below to prove the brand cannot be imitated.
declare const collision: unique symbol

describe('compile-time collision guard', () => {
  it('a collision is rejected at the colliding verb, not one step later', () => {
    const chain = lunette()
      .provide(() => ({ useCases: { auth: { login: (): string => 'ok' } } }))
      // @ts-expect-error — 'useCases' is already in the context: the provider is rejected
      .provide(() => ({ useCases: { profile: { get: (): string => 'me' } } }))

    // the chain keeps typing past the red line: run is still there
    expectTypeOf(chain.run).toBeFunction()
  })

  it('downstream of a collision the siblings stay typed (no cascade)', () => {
    lunette()
      .provide(() => ({ db: 1 }))
      .provide(() => ({ mailer: 'm' }))
      // @ts-expect-error — 'db' is duplicated: rejected HERE
      .provide(() => ({ db: 'two' }))
      .provide('auth', (ctx) => {
        expectTypeOf(ctx.mailer).toEqualTypeOf<string>()

        // the honest cost of the argument-side guard: until the collision
        // is fixed, the collided key's type is the impossible intersection
        // (number & string = never here) — in-editor only, the build is red
        expectTypeOf(ctx.db).toBeNever()

        return true
      })
  })

  it('with one key per area the chain flows normally', async () => {
    const app = await lunette()
      .provide(() => ({ provide: () => {} })) // verb names are NOT reserved
      .expose(() => ({ auth: { login: (): string => 'ok' } }))
      .expose(() => ({ profile: { get: (): string => 'me' } }))
      .run(async (pub) => pub)

    expectTypeOf(app.auth.login).toEqualTypeOf<() => string>()
    expectTypeOf(app.profile.get).toEqualTypeOf<() => string>()
  })

  it('also reports multiple collisions, as a union of messages', () => {
    lunette()
      .provide(() => ({ db: 1, email: 2 }))
      // @ts-expect-error — both 'db' and 'email' are duplicated
      .provide(() => ({ db: 3, email: 4, repos: 5 }))
  })

  it('an async provider is guarded through the Promise', () => {
    lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — the brand rides the resolved type
      .provide(async () => ({ db: 'two' }))
  })

  it('every verb form is guarded, not just provide', () => {
    lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — expose, patch form
      .expose(() => ({ db: 'two' }))

    lunette()
      .provide('db', () => 1)
      // @ts-expect-error — expose, keyed form
      .expose('db', () => 'two')

    lunette()
      .provide('db', () => 1)
      // @ts-expect-error — use, keyed form
      .use('db', async (_ctx, next) => next('two'))

    lunette()
      .provide('db', () => 1)
      // @ts-expect-error — use, layer form: the patch rides next()
      .use(async (_ctx, next) => next({ db: 'two' }))
  })
})

// The brand property is a PRIVATE unique symbol (same idiom as
// providedBrand): nobody outside the module can name it, so the guard
// cannot be satisfied by hand and never competes with user keys.
describe('the guard brand is unforgeable and does not shadow user keys', () => {
  it('writing the exact message into the patch does not lift the guard', () => {
    lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — a hand-written 'collision' property is just a key, not the brand
      .provide(() => ({
        db: 'two',
        collision: '⛔ key already present in the context: db' as const,
      }))
  })

  it('a user-side symbol with the same name is not the brand either', () => {
    lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — different symbol identity: the brand stays missing
      .provide(() => ({
        db: 'two',
        [collision]: '⛔ key already present in the context: db' as const,
      }))
  })

  it("a domain key named 'collision' is an ordinary key", async () => {
    const app = await lunette()
      .expose(() => ({ collision: { bodies: 2 } }))
      .run(async (pub) => pub)

    expectTypeOf(app.collision).toEqualTypeOf<{ bodies: number }>()
  })

  it("a domain 'collision' key does not muddy a real clash elsewhere", () => {
    lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — 'db' is duplicated; the user's collision key stays out of the demand
      .provide(() => ({ db: 'two', collision: { bodies: 2 } }))
  })
})

// Non-string PropertyKeys must not lose the message (a `${K & string}`
// interpolation collapses it to never). The two key kinds go two ways:
// symbols get a LABEL (no `${symbol}` exists at the type level — tsc
// still names the binding, `typeof theSym`, in the same diagnostic);
// numbers are REJECTED outright (decision 30), because the deeper hole
// is the key itself: the runtime coerces 42 to "42" while the types
// keep them distinct, so a numeric key could slip past the guard and
// throw at runtime. Strings name, symbols give identity, numbers are
// not keys.
// The message types are the REAL ones (imported above): asserting on
// them checks the exact text without the TS2769 overload-set noise of
// the real verbs.

declare const reusedSymKey: unique symbol

describe('non-string PropertyKeys: symbols labelled, numbers rejected', () => {
  it('a reused symbol key is caught and the message says a symbol collided', () => {
    // @ts-expect-error — symbol key collision caught, at the reuse
    void lunette().provide(reusedSymKey, () => 1).provide(reusedSymKey, () => 2)

    // the message cannot name a symbol (no type-level name exists), but
    // it stays a readable sentence — and the diagnostic itself prints
    // `typeof reusedSymKey` on the argument side, naming the binding
    type Actual = DupKeyMsg<typeof reusedSymKey>
    expectTypeOf<Actual>().toEqualTypeOf<'⛔ key already present in the context: (symbol key)'>()
  })

  it('a symbol key used once flows and is readable downstream', async () => {
    const app = await lunette()
      .provide(reusedSymKey, () => 2)
      .expose((ctx) => ({ doubled: ctx[reusedSymKey] * 2 }))
      .run(async (pub) => pub)

    expectTypeOf(app.doubled).toEqualTypeOf<number>()
  })

  it('a numeric key is rejected at first use, naming it', () => {
    // @ts-expect-error — keyed form: 42 is not a key
    void lunette().provide(42, () => 1)

    // @ts-expect-error — patch form: { 42: … } is not a key either
    void lunette().provide(() => ({ 42: 'x' }))

    // numbers DO interpolate — the ban message names the key exactly
    expectTypeOf<NumKeyMsg<42>>().toEqualTypeOf<'⛔ numeric key not supported (it becomes a string at runtime): 42'>()
  })

  it("the hazard that motivated the ban: 42 and '42' are one runtime key", () => {
    // Under a PropertyKey-wide guard this program was GREEN and threw at
    // runtime ({ 42: x } owns the key "42", colliding with the string
    // '42' the type system considers distinct). The ban makes it red.
    void lunette()
      .provide('42', () => 'a')
      // @ts-expect-error — numeric key rejected before it can lie
      .provide(() => ({ 42: 'b' }))
  })

  it('an array is not a patch: its numeric index falls under the ban', () => {
    // @ts-expect-error — keyof number[] includes number
    void lunette().provide(() => [1, 2])
  })
})

// The verdict must not short-circuit on the numeric ban before
// evaluating the clash: a patch carrying BOTH a numeric key and a
// genuine string collision reports the two TOGETHER as a union of
// messages — consistent with how multiple string collisions report —
// with the empty side interpolating never and vanishing from the union
// (decision 30). Both the key sets and the message types are the REAL
// ones (imported above): nothing here can drift.
type MirrorCollisionMsg<Ctx, P> =
  | NumKeyMsg<NumKeys<P>>
  | DupKeyMsg<Clash<Ctx, P>>

describe('a numeric key and a string collision report together', () => {
  it('a patch with both violations names both in one union', () => {
    type Ctx = { db: number }
    type P = { db: string; 7: string }

    expectTypeOf<MirrorCollisionMsg<Ctx, P>>().toEqualTypeOf<
      | '⛔ numeric key not supported (it becomes a string at runtime): 7'
      | '⛔ key already present in the context: db'
    >()

    // and on the real chain the argument is rejected with that union:
    void lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — numeric 7 banned AND db duplicated, one diagnostic
      .provide(() => ({ db: 'two', 7: 'x' }))
  })

  it('with no numeric key the union degrades to the plain collision message', () => {
    expectTypeOf<MirrorCollisionMsg<{ db: number }, { db: string }>>()
      .toEqualTypeOf<'⛔ key already present in the context: db'>()
  })
})

// A union key ('db' | 'mailer' — from config, a branch, a loop) is
// checked as a SET: one colliding member is a collision. The check must
// be tuple-wrapped so the union does NOT distribute over the guard's
// conditional — a naked conditional lets the clean member collapse the
// whole verdict to unknown, and the guard silently vanishes.
declare const dbOrMailer: 'db' | 'mailer'
declare const cacheOrQueue: 'cache' | 'queue'
declare const numOrFresh: 42 | 'fresh'
declare const coin: boolean

describe('union keys: one colliding member is a collision', () => {
  it('a union key with a colliding member is rejected, naming that member', () => {
    void lunette()
      .provide('db', () => 1)
      // @ts-expect-error — 'db' | 'mailer' contains 'db': rejected
      .provide(dbOrMailer, () => 'two')

    // the message names exactly the colliding member, not the whole union
    expectTypeOf<DupKeyMsg<Extract<'db' | 'mailer', 'db'>>>()
      .toEqualTypeOf<'⛔ key already present in the context: db'>()
  })

  it('every keyed verb checks the union, not just provide', () => {
    void lunette()
      .provide('db', () => 1)
      // @ts-expect-error — expose, keyed form: the union member collides
      .expose(dbOrMailer, () => 'two')

    void lunette()
      .provide('db', () => 1)
      // @ts-expect-error — use, keyed form: the union member collides
      .use(dbOrMailer, async (_ctx, next) => next('two'))
  })

  it('a union carrying a numeric member falls under the numeric ban', () => {
    // @ts-expect-error — 42 in the union: numbers are not keys (decision 30)
    void lunette().provide(numOrFresh, () => 1)
  })

  it('a union key with no colliding member flows', () => {
    // Pinned current behavior: the context gains BOTH members (Record
    // over a union) while the runtime sets exactly one — a residual of
    // the same family as decision 30's, worth its own decision if a
    // real case ever hits it. The collision guard's job here is only
    // the clash, and there is none.
    const chain = lunette().provide('db', () => 1).provide(cacheOrQueue, () => 'v')
    expectTypeOf(chain.run).toBeFunction()
  })

  it('a provider returning a UNION of patches is still guarded', () => {
    // tsc normalizes a union of object literals with optional-never
    // absent members, so keyof sees every key of every branch: a
    // colliding branch cannot hide behind the union.
    void lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — the { db } branch collides
      .provide(() => (coin ? { db: 2 } : { other: 3 }))
  })

  it('an EXPLICIT union type argument is judged member-wise too', () => {
    // No literal normalization here: `keyof (A | B)` keeps only the
    // SHARED keys, so an undistributed Clash would collapse and let a
    // colliding member through silently — same distribution convention
    // as union seeds. Reachable only via the explicit type argument
    // (an annotated union return is already refused by inference).
    type DbPatch = { db: number }
    type MailerPatch = { mailer: string }

    void lunette()
      .provide(() => ({ mailer: 'taken' }))
      // @ts-expect-error — the MailerPatch member collides
      .provide<DbPatch | MailerPatch>(() => (coin ? { db: 1 } : { mailer: 'x' }))

    // the numeric ban distributes the same way
    type WithNum = { 42: string }
    // @ts-expect-error — the WithNum member carries a numeric key
    void lunette().provide<DbPatch | WithNum>(() => (coin ? { db: 1 } : { 42: 'x' }))
  })
})

describe('symbol keys are guarded in the patch form too', () => {
  it('the same symbol reused inside a patch is caught', () => {
    void lunette()
      .provide(() => ({ [reusedSymKey]: 1 }))
      // @ts-expect-error — same symbol identity, patch form: caught
      .provide(() => ({ [reusedSymKey]: 2 }))
  })
})

// Decision 31: extensions supply VALUES (adapters, windows, decorators,
// fragments); only the app extends the chain, and always concretely. A
// helper generic over the chain asks tsc to prove "no collision, for
// EVERY Ctx" at the definition site — unprovable, since a caller's chain
// may well carry the key — so the argument-side guard refuses with
// TS2769. That refusal is a guardrail, not a gap: the reusable form of
// "add these layers" is a fragment (requirements in the Seed, collision
// checked at the mount, on a concrete chain), and the package-level
// patterns are the adapter/window pairs of issues #27/#28.
describe('generic chain extension is refused by design (decision 31)', () => {
  it('a helper generic over the chain cannot call the guarded verbs', () => {
    function addRenderer<
      Ctx extends object,
      Pub extends object,
      Seed extends object,
    >(chain: Lunette<Ctx, Pub, Seed>) {
      // @ts-expect-error — unprovable for every Ctx: write a fragment instead
      return chain.provide('renderer', () => 'r')
    }
    void addRenderer
  })

  it('the same helper over a concrete chain type compiles', () => {
    const base = lunette().provide('db', () => 1)
    const addRenderer = (chain: typeof base) =>
      chain.provide('renderer', () => 'r')

    expectTypeOf(addRenderer(base).run).toBeFunction()
  })
})

// `any` must not make the guard LIE: `keyof any` is every key, so an
// unguarded `Extract` would flag EVERY subsequent key as "already
// present" — red for the wrong reason, a message asserting a falsehood.
// A guard that cannot check must say so: an any CONTEXT is refused by
// name. The degradation points themselves cannot go red on their own
// line — `any` absorbs every brand intersection (`any & Brand = any`) —
// so an any PATCH is silent where it happens and honest at the next
// wiring line (the context is any by then); an any KEY is the pinned
// residual below. (decisions §4)
declare const anyValue: any
declare const anyKey: any

describe('an any context is refused by name, not with a false collision', () => {
  it('an untyped seed is refused at the first wiring line, both forms', () => {
    // @ts-expect-error — Ctx is any: the guard cannot check keys
    void lunette<any>().provide(() => ({ db: 1 }))

    // @ts-expect-error — keyed form: same refusal
    void lunette<any>().provide('db', () => 1)

    expectTypeOf<AnyCtxMsg>().toEqualTypeOf<'⛔ context degraded to any: the guard cannot check keys — restore a real type'>()
  })

  it('an any patch is silent at its own line, honest at the next', () => {
    void lunette()
      .provide(() => anyValue) // any absorbs the brand: green HERE
      // @ts-expect-error — the context is now any: refused by name
      .provide(() => ({ db: 1 }))
  })

  it('override does not run blind on an any context either', () => {
    const chain = lunette<any>().override(() => ({ db: 2 }))

    expectTypeOf(chain).toEqualTypeOf<{ override: AnyCtxMsg }>()
  })

  it('mount is covered through the collision side of its overloads', () => {
    const frag = lunette().expose(() => ({ auth: 1 }))

    // @ts-expect-error — any host context: refused by name
    void lunette<any>().use(frag)
  })

  it('a TOP-LEVEL widened patch is refused, pointing at the move (decision 32)', () => {
    // A patch whose keyof carries no nameable keys has no legitimate
    // top-level form: it would drop the collision check to boot, lie on
    // absent reads, and poison keyof Ctx so every LATER literal provide
    // reads "already present" — failing at the wrong line with the
    // wrong message. Decision-30-shaped: no surviving use → refuse at
    // the offending line, with the cure in the text.
    void lunette()
      .provide('db', () => 1)
      // @ts-expect-error — no nameable keys: mount the bag under a literal key
      .provide((): Record<string, unknown> => ({ db: 'clobbered' }))

    // ...and the same shape through every patch door:
    // @ts-expect-error — expose, patch form
    void lunette().expose((): Record<string, unknown> => ({ a: 1 }))

    // a union with a no-names member is judged member-wise
    type Bag = Record<string, unknown>
    // @ts-expect-error — the Bag member carries no nameable keys
    void lunette().provide<{ db: number } | Bag>(() => (coin ? { db: 1 } : {}))

    expectTypeOf<WidenedPatchMsg>().toEqualTypeOf<'⛔ patch carries no nameable keys: mount the dynamic bag under a literal key'>()
  })

  it('the NAMESPACED dynamic bag is the sanctioned form and flows', async () => {
    // "One top-level key per area" applied to runtime data: the index
    // signature lives inside the VALUE, keyof Ctx stays clean, the
    // guard stays fully active for siblings.
    const app = await lunette()
      .provide('db', () => 1)
      .expose('payments', (): Record<string, number> => ({ stripe: 1 }))
      .provide('later', () => 'still fine') // no poisoned-chain effect
      .run(async (pub) => pub)

    expectTypeOf(app.payments['stripe']).toEqualTypeOf<number | undefined>()
  })

  it('an EMPTY patch is not a widened patch: it flows', () => {
    const chain = lunette().provide(() => ({}))
    expectTypeOf(chain.run).toBeFunction()
  })

  it("residual, pinned: a WIDENED string key is the runtime net's territory", () => {
    // Pre-existing on main (the old return-type guard had the identical
    // mechanism): Extract<string, 'db'> is never, so a key typed as
    // plain `string` bypasses the literal-based check and the runtime
    // net throws at boot instead (asserted in keyed.test.ts). Recorded
    // in decisions §4 with the other widened-type residuals.
    const widened: string = 'db'
    const chain = lunette().provide('db', () => 1).provide(widened, () => 2)

    expectTypeOf(chain.run).toBeFunction()
  })

  it('a never context (a throw-only stub upstream) is blamed as never, not any', () => {
    // `provide(() => { throw ... })` infers a never patch — green at
    // its own line (never absorbs the brand downward, symmetric to any
    // absorbing it upward) — and collapses the context to never. The
    // next wiring line must not say "degraded to any" (factually
    // wrong): never is not any; the blame names the real cause.
    const chain = lunette().provide(() => {
      throw new Error('todo')
    })
    expectTypeOf(chain.run).toBeFunction() // green at the stub's line

    void chain
      // @ts-expect-error — the context is now never: refused by name
      .provide(() => ({ db: 1 }))

    expectTypeOf<NeverCtxMsg>().toEqualTypeOf<'⛔ context collapsed to never: an upstream provider returns never — give it a real return type'>()
  })

  it('where the brand STICKS, a degenerate contribution is blamed honestly', () => {
    // In provide/expose the brand rides the patch VALUE, so any absorbs
    // it (silent here, honest at the next line — pinned above). In
    // use(layer) and the mount overloads the brand rides the
    // FUNCTION/CHAIN value, which is not any — the brand sticks, and
    // without the P-side branch it would fire with the verdict's
    // artifacts ('numeric ${number}') instead of naming the real cause.
    const raw = '{}'
    void lunette()
      .provide(() => ({ db: 1 }))
      // @ts-expect-error — the layer's contribution is any: refused by name
      .use(async (_ctx, next) => next(JSON.parse(raw)))
  })

  it('mounting a fragment whose Pub degraded to any is refused by name too', () => {
    // @ts-expect-error — any Pub: the collision guard cannot check it
    void lunette().provide(() => ({ db: 1 })).use(anyPubFrag)
  })

  it('a fully-indexed CONCRETE context is not blamed as any', () => {
    // Constructible from the public API: a declared seed indexed by all
    // three key kinds satisfies the keyof pre-filter, but it is not
    // any — blaming it as "degraded" would be a lie. The exact confirm
    // stage tells them apart, and the fully-indexed context gets the
    // STRUCTURAL verdict instead: its index signatures genuinely claim
    // every key (same doctrine as the any-KEY residual below), so
    // override — whose contract is "replace existing keys" — flows.
    type TripleIndexed = Record<string, unknown> &
      Record<number, unknown> &
      Record<symbol, unknown>

    const chain = lunette<TripleIndexed>().override(() => ({ foo: 1 }))
    expectTypeOf(chain.run).toBeFunction()

    // ...while providing a "new" key is refused as already present —
    // consistent with what the declared type claims:
    // @ts-expect-error — the index signature owns 'foo' already
    void lunette<TripleIndexed>().provide(() => ({ foo: 1 }))
  })

  it('the degenerate brand cells carry EXACTLY their message (wiring pin)', () => {
    // A bare expect-error suppression cannot tell the honest message
    // from an artifact: these pin which message each degenerate cell of
    // the sticky brand actually wires.
    type Ctx = { db: number }

    expectTypeOf<BrandMsg<CollisionBrand<never, { p: 1 }>>>().toEqualTypeOf<NeverCtxMsg>()
    expectTypeOf<BrandMsg<CollisionBrand<any, { p: 1 }>>>().toEqualTypeOf<AnyCtxMsg>()
    expectTypeOf<BrandMsg<CollisionBrand<Ctx, never>>>().toEqualTypeOf<NeverPatchMsg>()
    expectTypeOf<BrandMsg<CollisionBrand<Ctx, any>>>().toEqualTypeOf<AnyPatchMsg>()

    // and the context always wins the blame
    expectTypeOf<BrandMsg<CollisionBrand<never, any>>>().toEqualTypeOf<NeverCtxMsg>()
    expectTypeOf<BrandMsg<CollisionBrand<any, never>>>().toEqualTypeOf<AnyCtxMsg>()
  })

  it('residual, pinned: an any KEY mints an index-signature context', () => {
    // Not catchable at its own line (any absorbs the brand), and the
    // context it leaves behind is NOT any — it is Ctx & Record<any, V>,
    // whose phantom index signature makes the next line read "already
    // present": consistent with what the (wrong) type now claims, so the
    // any-context refusal cannot reach it. Recorded in decisions §4; the
    // runtime nets stay the floor under every phantom.
    void lunette()
      .provide(anyKey, () => 1)
      // @ts-expect-error — the phantom index signature claims every key
      .provide(() => ({ db: 2 }))
  })
})
