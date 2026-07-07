import { describe, expectTypeOf, it } from 'vitest'
import { lunette, type Lunette } from '../../src/index.ts'
// The real unmet-key computation and message types, imported so this
// contract cannot drift from what the requirement message actually
// names (type-only, not part of the public index.ts surface).
import type {
  AnySeedMsg,
  NeverSeedMsg,
  RequirementBrand,
  UnmetSeed,
  UnmetSeedOf,
} from '../../src/chain.ts'

// Reads the message value out of a brand object without naming its
// private symbol key (see collision-guard.test-d.ts).
type BrandMsg<B> = B[keyof B]

type Env = { DATABASE_URL: string }

const authChain = lunette<{ env: Env }>()
  .provide(({ env }) => ({ authDb: { url: env.DATABASE_URL } }))
  .expose(({ authDb }) => ({ auth: { whoami: (): string => authDb.url } }))

describe('mount (types)', () => {
  it("only the fragment's Pub crosses the boundary", async () => {
    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env }))
      .expose(authChain)
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ auth: { whoami: () => string } }>()

    // @ts-expect-error — authDb is private to the fragment: it does not exist here
    app.authDb
  })

  it('use(chain): the mounted Pub is private in the host but visible downstream', async () => {
    const infra = lunette().expose(() => ({ db: { url: 'pg://x' } }))

    const app = await lunette()
      .use(infra)
      .expose((ctx) => {
        expectTypeOf(ctx.db).toEqualTypeOf<{ url: string }>()
        return { api: { where: (): string => ctx.db.url } }
      })
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{ api: { where: () => string } }>()

    // @ts-expect-error — db is private: mounted with use, not with expose
    app.db
  })

  it("mounting without satisfying the fragment's Seed is rejected at the mount point", () => {
    const chain = lunette()
      // @ts-expect-error — the host context does not provide env
      .expose(authChain)

    // the chain keeps typing past the red line
    expectTypeOf(chain.run).toBeFunction()
  })

  it('a seed key present with the WRONG type is also rejected', () => {
    lunette()
      .provide('env', () => 42)
      // @ts-expect-error — env is there but it is not { DATABASE_URL: string }
      .expose(authChain)
  })

  it("the fragment's Pub colliding with a host key is rejected at the mount point", () => {
    const openFrag = lunette().expose(() => ({
      auth: { whoami: (): string => 'f' },
    }))

    lunette()
      .provide('auth', () => 1)
      // @ts-expect-error — 'auth' is already in the host context
      .expose(openFrag)
  })

  it('.as renames the Pub in the type and propagates the Seed', async () => {
    const renamed = authChain.as('http')

    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env }))
      .expose(renamed)
      .run(async (pub) => pub)

    expectTypeOf(app).toEqualTypeOf<{
      http: { auth: { whoami: () => string } }
    }>()

    // the Seed survives .as: without env the mount is rejected
    // @ts-expect-error — env is missing from the host context
    void lunette().expose(renamed)
  })

  it("the seed mapper is checked against the fragment's requirements", () => {
    // Deliberate asymmetry with the no-mapper path: the mapper's return
    // has a structural surface against FSeed, so this error is the
    // BINDER'S VOICE — plain assignability naming the missing key WITH
    // its true shape ("Property 'env' is missing in type '{ wrong: Env }'
    // but required in type '{ env: Env }'"). No brand: recite only where
    // the type is mute (the no-mapper path relates two inferred
    // parameters and needs one — decisions §4). Adding UnmetSeed here
    // would trade shapes for name-only.
    lunette()
      .provide(() => ({ mainEnv: { DATABASE_URL: 'x' } as Env }))
      // @ts-expect-error — the mapper does not produce { env: Env }
      .expose(authChain, ({ mainEnv }) => ({ wrong: mainEnv }))
  })

  it("with a seed mapper, the fragment's Pub is still collision-guarded", () => {
    lunette()
      .provide(() => ({ auth: 1, mainEnv: { DATABASE_URL: 'x' } as Env }))
      // @ts-expect-error — 'auth' is already in the host context, mapper or not
      .expose(authChain, ({ mainEnv }) => ({ env: mainEnv }))
  })
})

// OPTIONAL seed keys and the unmet-key message. A homomorphic mapping
// over FSeed would keep an optional key's `?` on the mapped result, and
// indexing would add a phantom `undefined` to the union — which
// KeyLabel prints as a nonsensical '(symbol key)' — while listing the
// optional key itself as unmet although its absence is legitimate (the
// accept/reject gate rightly accepts it; the message must not
// contradict it). The contract: an absent optional key is not unmet, a
// required absent key is, and an optional key PRESENT with the wrong
// type still is.
declare const optSym: unique symbol

describe('optional seed keys: absence is not an unmet requirement', () => {
  const wantsOpt = lunette<{ env: Env; opt?: string }>().expose(({ env, opt }) => ({
    auth: { url: env.DATABASE_URL, tag: opt },
  }))

  it('the message names ONLY the required key, no phantom entries', () => {
    expectTypeOf<UnmetSeed<{}, { env: Env; opt?: string }>>().toEqualTypeOf<'env'>()
  })

  it('a host satisfying the required key mounts without providing the optional one', async () => {
    const app = await lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env }))
      .expose(wantsOpt)
      .run(async (pub) => pub)

    expectTypeOf(app.auth.url).toEqualTypeOf<string>()
  })

  it('an optional key PRESENT with the wrong type is unmet, and named', () => {
    expectTypeOf<UnmetSeed<{ env: Env; opt: number }, { env: Env; opt?: string }>>()
      .toEqualTypeOf<'opt'>()

    lunette()
      .provide(() => ({ env: { DATABASE_URL: 'x' } as Env, opt: 42 }))
      // @ts-expect-error — opt is there but it is not a string
      .expose(wantsOpt)
  })

  it('an optional SYMBOL seed key follows the same rule', () => {
    // absent: not unmet; present with the wrong type: unmet, labelled
    expectTypeOf<UnmetSeed<{}, { [optSym]?: string }>>().toBeNever()
    expectTypeOf<UnmetSeed<{ [optSym]: number }, { [optSym]?: string }>>()
      .toEqualTypeOf<typeof optSym>()
  })
})

// Degenerate seeds would be a SILENT PASS, not a wrong message: an any
// seed makes [Ctx] extends [FSeed] trivially true, so without these
// gates a fragment's real requirements go entirely unchecked — and the
// path needs no annotation (a seed mapper returning JSON.parse(...)
// infers any, which satisfies FSeed by plain assignability). Both doors
// refuse by name: the mapper's function value is not any even when its
// return is, so a brand STICKS to it — unlike the patch positions where
// any absorbs (decisions §4).
declare const anySeedFrag: Lunette<{ x: number }, { pub: string }, any>

describe('degenerate fragment seeds are refused, not silently accepted', () => {
  const wantsEnv = lunette<{ env: Env }>().expose(({ env }) => ({
    auth: { url: env.DATABASE_URL },
  }))

  it('an any-returning seed mapper is refused at the mount', () => {
    const raw = '{}'
    lunette()
      .provide(() => ({ unrelated: 1 }))
      // @ts-expect-error — the mapper's return is any: requirements unchecked
      .expose(wantsEnv, () => JSON.parse(raw))

    expectTypeOf<AnySeedMsg>().toEqualTypeOf<'⛔ fragment seed degraded to any: the guard cannot check requirements — restore a real type'>()
  })

  it('a fragment whose declared Seed degraded to any cannot mount silently', () => {
    // @ts-expect-error — the fragment's seed type is any: refused by name
    void lunette().use(anySeedFrag)
  })

  it('an any-Seed fragment cannot slip through the seed-MAPPER door either', () => {
    // The mapper overloads carry SeedBrand<S> for the mapper's OWN
    // inferred return — but with FSeed = any, `S extends FSeed` is
    // vacuous and a clean mapper would smuggle the degenerate fragment
    // in: requirements unchecked, the silent-pass class. The chain
    // argument itself must carry the FSeed degeneracy gate.
    // @ts-expect-error — the fragment's seed is any: refused at the mount
    void lunette().use(anySeedFrag, () => ({ whatever: 1 }))

    // @ts-expect-error — same door on expose
    void lunette().expose(anySeedFrag, () => ({ whatever: 1 }))
  })

  it('the degenerate seed cells carry EXACTLY their message (wiring pin)', () => {
    expectTypeOf<BrandMsg<RequirementBrand<{}, any>>>().toEqualTypeOf<AnySeedMsg>()
    expectTypeOf<BrandMsg<RequirementBrand<{}, never>>>().toEqualTypeOf<NeverSeedMsg>()

    expectTypeOf<NeverSeedMsg>().toEqualTypeOf<'⛔ fragment seed collapsed to never — give it a real type'>()
  })

  it('a well-typed mapper still flows (no false positive)', async () => {
    const app = await lunette()
      .provide(() => ({ mainEnv: { DATABASE_URL: 'x' } as Env }))
      .expose(wantsEnv, ({ mainEnv }) => ({ env: mainEnv }))
      .run(async (pub) => pub)

    expectTypeOf(app.auth.url).toEqualTypeOf<string>()
  })
})

// A UNION Seed means "any ONE of these alternatives" ({ redis } |
// { memcache }): the gate accepts a host satisfying either member. The
// unmet-key message must distribute over the members — `keyof` over a
// union keeps only the SHARED keys, so an undistributed UnmetSeed
// collapses to never and the message falls back to the nameless
// '⛔ fragment requirements not satisfied', naming nothing.
describe('union seeds: alternatives named, either alternative accepted', () => {
  const wantsEither = lunette<{ redis: string } | { memcache: number }>()
    .expose(() => ({ cachePub: 1 }))

  it('the unmet message names the keys of EVERY alternative', () => {
    expectTypeOf<
      UnmetSeedOf<{}, { redis: string } | { memcache: number }>
    >().toEqualTypeOf<'redis' | 'memcache'>()

    // @ts-expect-error — neither alternative is satisfied
    void lunette().use(wantsEither)
  })

  it('satisfying ONE alternative mounts', async () => {
    const app = await lunette()
      .provide(() => ({ redis: 'r' }))
      .expose(wantsEither)
      .run(async (pub) => pub)

    expectTypeOf(app.cachePub).toEqualTypeOf<number>()
  })
})

// When a mount fails BOTH gates at once (seed unmet AND Pub colliding),
// the two brands are demanded together on the same argument: the
// diagnostic elaborates both `[requirement]` and `[collision]` messages
// — neither silences the other.
describe('simultaneous requirement + collision failure', () => {
  it('both brands are demanded on the same mount', () => {
    const greedy = lunette<{ env: Env }>().expose(() => ({ taken: 1 }))

    void lunette()
      .provide(() => ({ taken: 'host-own' }))
      // @ts-expect-error — env missing AND 'taken' colliding, one line
      .expose(greedy)
  })
})
