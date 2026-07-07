// DX exploration, NOT the contract (that is collision-guard.test-d.ts):
// WHERE the guard diagnostics land and WHAT they say — the return-type
// guard shipped before this change vs the argument-constraint prototypes
// that replaced it (decision in discussion #21, tracker issue #25).
// Verbatim tsc 5.9 output is quoted above each @ts-expect-error. All
// prototypes are self-contained declared classes; the final section
// exercises the real chain. The contract files assert the behaviour —
// this file is the evidence record.
//
// Emoji rendering note (found in the editor): non-ASCII characters in
// property NAMES are printed escaped in diagnostics ('⛔ keys …'),
// while string literal VALUES print raw ('⛔ key …'). Consequence:
// ASCII brand property, emoji only in the message value.
//
// Scope: the keyed form (constraint on the key literal), the patch form
// (same trick on fn's return type), the mount form (fragment
// requirements at the mount point), the honest cost of the real verbs'
// overload sets, and the brand-property refinement (a private symbol —
// the string-keyed prototypes below predate it; see the last section).

import { describe, expectTypeOf, it } from 'vitest'
import { lunette } from '../../src/index.ts'

declare const fakeCollision: unique symbol

// ── shared accumulation model: same shape as the real chain, no runtime ──

type DupKeyMsg<K extends PropertyKey> =
  `⛔ key already present in the context: ${K & string}`

type PatchClash<Ctx, P> = Extract<keyof P, keyof Ctx>

type CollisionBrand<Ctx, P> = PatchClash<Ctx, P> extends never
  ? unknown
  : { collision: DupKeyMsg<PatchClash<Ctx, P>> }

// ── before: guard on the RETURN type (shipped until this change) ──────────

declare class ChainBefore<Ctx extends object> {
  provide<K extends PropertyKey, V>(
    key: K,
    fn: (ctx: Ctx) => V,
  ): PatchClash<Ctx, Record<K, V>> extends never
    ? ChainBefore<Ctx & Record<K, V>>
    : {
        '⛔ keys already present in the context': PatchClash<Ctx, Record<K, V>>
      }
  expose<K extends PropertyKey, V>(
    key: K,
    fn: (ctx: Ctx) => V,
  ): PatchClash<Ctx, Record<K, V>> extends never
    ? ChainBefore<Ctx & Record<K, V>>
    : {
        '⛔ keys already present in the context': PatchClash<Ctx, Record<K, V>>
      }
}
declare const before: ChainBefore<{}>

describe('before: guard on the RETURN type', () => {
  it('stops the chain, but the diagnostic lands one step LATE and cascades', () => {
    const collided = before
      .provide('db', (): { query: () => number } => ({ query: () => 1 }))
      .provide('mailer', (): { send: () => void } => ({ send: () => {} }))
      .provide('db', () => ({ query: () => 2 })) // the mistake is HERE...

    // ...but tsc reports on the NEXT verb, two diagnostics:
    //   error TS2339: Property 'expose' does not exist on type
    //     '{ '⛔ keys already present in the context': "db"; }'.
    //   error TS7006: Parameter 'ctx' implicitly has an 'any' type.
    // The key IS named, but the location is off by one step, the first
    // line reads like a library bug (the emoji in the property NAME is
    // printed as its \u escape), and every later verb with a callback
    // adds one more TS7006.
    // @ts-expect-error — the chain stopped: no verbs exist on the error type
    void collided.expose('auth', (ctx) => ({ login: () => ctx.db.query() }))

    // The upside of stopping: downstream types NEVER lie (the error object
    // is inert — nothing can be built from it).
    expectTypeOf(collided).toEqualTypeOf<{
      '⛔ keys already present in the context': 'db'
    }>()
  })
})

// ── the prototypes: move the check onto the ARGUMENT ──────────────────────

// B1 — message as a bare string literal. DEAD END, recorded so it is not
// re-proposed: "db" & "⛔ …" are two different string literals, so the
// intersection REDUCES to never and tsc prints the reduced type — the
// message is lost.
declare class KeyedChainB1<Ctx extends object> {
  provide<K extends PropertyKey, V>(
    key: K & (K extends keyof Ctx ? DupKeyMsg<K> : unknown),
    fn: (ctx: Ctx) => V,
  ): KeyedChainB1<Ctx & Record<K, V>>
}
declare const b1: KeyedChainB1<{}>

// B2 — message branded under an ASCII property ('collision'): string &
// object does not reduce, the property name prints unescaped, and the
// emoji lives in the VALUE where it renders raw. Two overloads, mirroring
// the real verb: keyed (constraint on the key literal) and patch
// (constraint on fn's return type).
declare class ChainB2<Ctx extends object> {
  provide<K extends PropertyKey, V>(
    key: K & (K extends keyof Ctx ? { collision: DupKeyMsg<K> } : unknown),
    fn: (ctx: Ctx) => V,
  ): ChainB2<Ctx & Record<K, V>>
  provide<P extends object>(
    fn: (ctx: Ctx) => P &
      (PatchClash<Ctx, P> extends never
        ? unknown
        : { collision: DupKeyMsg<PatchClash<Ctx, P>> }),
  ): ChainB2<Ctx & P>
}
declare const b2: ChainB2<{}>

describe('prototype B1: argument constraint, string-literal message', () => {
  it('right line, but the intersection reduces to never — message lost', () => {
    void b1
      .provide('db', () => 1)
      .provide('mailer', () => 'm')
      // The diagnostic lands on the RIGHT line, but says only:
      //   error TS2345: Argument of type '"db"' is not assignable to
      //     parameter of type 'never'.
      // @ts-expect-error — collision caught, message reduced away
      .provide('db', () => 2)
  })
})

describe('prototype B2: argument constraint, object-branded message', () => {
  it('keyed form: exact line, named key, and NO downstream cascade', () => {
    void b2
      .provide('db', () => 1)
      .provide('mailer', () => 'm')
      // Exact line, key named in a readable sentence, emoji intact:
      //   error TS2345: Argument of type '"db"' is not assignable to
      //     parameter of type '"db" & { collision: "⛔ key already present
      //     in the context: db"; }'.
      //     Type 'string' is not assignable to type '{ collision: "⛔ key
      //     already present in the context: db"; }'.
      // @ts-expect-error — collision caught, at the collision
      .provide('db', () => 'two')
      // ...and the chain KEEPS typing: the next verb gets a typed ctx
      // (compare with the TS7006 cascade of the return-type guard).
      .provide('auth', (ctx) => {
        expectTypeOf(ctx.mailer).toEqualTypeOf<string>()

        // THE HONEST COST — the sparring point for the decision record:
        // past the red line the accumulated type claims db: number & string
        // (= never here), i.e. the type LIES about the runtime until the
        // collision is fixed. The return-type guard can never lie (the
        // chain is dead); B2 lies transiently, in-editor only — the build
        // is still red at the collision line, so no GREEN program ever
        // lies.
        expectTypeOf(ctx.db).toBeNever()

        return true
      })
  })

  it("patch form: the constraint rides fn's return type, same quality", () => {
    void b2
      .provide('db', () => 1)
      .provide('mailer', () => 'm')
      // Lands on the colliding provider itself, key named:
      //   error TS2322: Type '{ db: string; }' is not assignable to type
      //     '{ db: string; } & { collision: "⛔ key already present in the
      //     context: db"; }'.
      //   Property 'collision' is missing in type '{ db: string; }' but
      //     required in type '{ collision: "⛔ key already present in the
      //     context: db"; }'.
      // @ts-expect-error — patch collision caught, at the collision
      .provide(() => ({ db: 'two' }))
  })

  it('patch form: multiple collisions produce a union of messages', () => {
    void b2
      .provide(() => ({ db: 1, email: 2 }))
      // Both keys named:
      //   ...required in type '{ collision: "⛔ key already present in the
      //     context: db" | "⛔ key already present in the context: email"; }'.
      // @ts-expect-error — both duplicated keys reported at once
      .provide(() => ({ db: 3, email: 4, repos: 5 }))
  })

  it('the happy path is untouched: both forms, plain inference', () => {
    void b2
      .provide('db', () => 1)
      .provide(() => ({ mailer: 'm', queue: [1, 2] }))
      .provide('auth', (ctx) => {
        expectTypeOf(ctx.db).toEqualTypeOf<number>()
        expectTypeOf(ctx.mailer).toEqualTypeOf<string>()
        expectTypeOf(ctx.queue).toEqualTypeOf<number[]>()
        return true
      })
  })
})

// ── the mount form: fragment requirements at the mount point ──────────────
// The remaining verb form from the spike. The gate stays [Ctx] extends
// [FSeed] (authoritative, same gate as the return-type MountGuard this
// replaces); the MESSAGE
// names the unmet keys — missing entirely, or present with an
// incompatible type.

type UnmetSeed<Ctx, FSeed> = {
  [K in keyof FSeed]: K extends keyof Ctx
    ? Ctx[K] extends FSeed[K]
      ? never
      : K
    : K
}[keyof FSeed]

type RequirementBrand<Ctx, FSeed> = [Ctx] extends [FSeed]
  ? unknown
  : {
      requirement: [UnmetSeed<Ctx, FSeed>] extends [never]
        ? '⛔ fragment requirements not satisfied'
        : `⛔ fragment requirement not satisfied: ${UnmetSeed<Ctx, FSeed> & string}`
    }

// M-PICK — the object-valued alternative (the old MountGuard's payload,
// `Pick<FSeed, missing>`, moved into the brand value). DEAD END,
// recorded so it is not re-proposed: tsc prints the UNRESOLVED Pick, and
// the wrong-type case shows `Pick<..., never>` — neither names anything.
declare class ChainMPick<
  Ctx extends object,
  Pub extends object,
  Seed extends object,
> {
  provide<K extends PropertyKey, V>(
    key: K & (K extends keyof Ctx ? { collision: DupKeyMsg<K> } : unknown),
    fn: (ctx: Ctx) => V,
  ): ChainMPick<Ctx & Record<K, V>, Pub, Seed>
  mount<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: ChainMPick<FCtx, FPub, FSeed> &
      ([Ctx] extends [FSeed]
        ? unknown
        : { requirement: Pick<FSeed, Exclude<keyof FSeed, keyof Ctx>> }),
  ): ChainMPick<Ctx & FPub, Pub, Seed>
}

// M — the string-valued brand, same grammar as `collision`.
declare class ChainM<
  Ctx extends object,
  Pub extends object,
  Seed extends object,
> {
  provide<K extends PropertyKey, V>(
    key: K & (K extends keyof Ctx ? { collision: DupKeyMsg<K> } : unknown),
    fn: (ctx: Ctx) => V,
  ): ChainM<Ctx & Record<K, V>, Pub, Seed>
  mount<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: ChainM<FCtx, FPub, FSeed> &
      RequirementBrand<Ctx, FSeed> &
      CollisionBrand<Ctx, FPub>,
  ): ChainM<Ctx & FPub, Pub, Seed>
}

type Env = { DATABASE_URL: string }

declare const mPickHost: ChainMPick<{}, {}, {}>
declare const mPickFrag: ChainMPick<
  { env: Env },
  { auth: { whoami: () => string } },
  { env: Env }
>
declare const mHost: ChainM<{}, {}, {}>
declare const mFrag: ChainM<
  { env: Env },
  { auth: { whoami: () => string } },
  { env: Env }
>
declare const mOpenFrag: ChainM<{}, { auth: number }, {}>

describe('mount prototype M-PICK: object-valued brand (rejected)', () => {
  it('prints an unresolved Pick — the missing key is buried', () => {
    //   Property 'requirement' is missing in type 'ChainMPick<...>' but
    //     required in type '{ requirement: Pick<{ env: Env; }, "env">; }'.
    // @ts-expect-error — caught, but the reader must unpick the Pick
    void mPickHost.mount(mPickFrag)
  })

  it('seed key present with the WRONG type: Pick<..., never> says nothing', () => {
    //   Property 'requirement' is missing in type 'ChainMPick<...>' but
    //     required in type '{ requirement: Pick<{ env: Env; }, never>; }'.
    // @ts-expect-error — caught, and the message names NOTHING
    void mPickHost.provide('env', () => 42).mount(mPickFrag)
  })
})

describe('mount prototype M: string-valued requirement brand', () => {
  it('requirements unmet: exact line, missing key named, emoji intact', () => {
    //   error TS2345: Argument of type 'ChainM<{ env: Env; }, ...>' is not
    //     assignable to parameter of type 'ChainM<{ env: Env; }, ...> &
    //     { requirement: "⛔ fragment requirement not satisfied: env"; }'.
    //   Property 'requirement' is missing in type 'ChainM<...>' but
    //     required in type '{ requirement: "⛔ fragment requirement not
    //     satisfied: env"; }'.
    // @ts-expect-error — unmet seed caught, at the mount point
    void mHost.mount(mFrag)
  })

  it('seed key present with the WRONG type: still named (via UnmetSeed)', () => {
    //   ...required in type '{ requirement: "⛔ fragment requirement not
    //     satisfied: env"; }'.
    // (a bare Exclude<keyof FSeed, keyof Ctx> would print never here —
    // UnmetSeed also catches the present-but-incompatible key)
    // @ts-expect-error — wrong-typed seed key caught AND named
    void mHost.provide('env', () => 42).mount(mFrag)
  })

  it("fragment Pub colliding with a host key rides the same 'collision' brand", () => {
    //   Property 'collision' is missing in type 'ChainM<{}, { auth: number; },
    //     {}>' but required in type '{ collision: "⛔ key already present in
    //     the context: auth"; }'.
    // @ts-expect-error — mounted Pub collision caught, at the mount point
    void mHost.provide('auth', () => 1).mount(mOpenFrag)
  })

  it('happy path: satisfied seed mounts without ceremony', () => {
    void mHost.provide('env', () => ({ DATABASE_URL: 'x' }) as Env).mount(mFrag)
  })
})

// ── the honest cost on the REAL verbs: overload sets ──────────────────────
// use/provide/expose are overloaded (patch | keyed | mount | mount+seed).
// When the brand rejects the argument, EVERY overload fails, so tsc wraps
// the diagnostic in 'TS2769: No overload matches this call' and elaborates
// the closest candidates — the branded message is still there, one indent
// deeper, in the relevant elaboration. The patch form is the exception:
// the argument SHAPE picks its overload uniquely, so the error stays a
// clean TS2322 on the return value. This section exercises the REAL chain
// (the implementation of the prototypes above), so the quotes track the
// shipped overload order: patch first, keyed second.

const dxFrag = lunette<{ env: Env }>().expose(({ env }) => ({
  auth: { url: env.DATABASE_URL },
}))

describe('the real overload set: TS2769 wraps, the message survives', () => {
  it('keyed collision: the branded message rides the keyed elaboration', () => {
    //   error TS2769: No overload matches this call.
    //   Overload 1 of 2, '(fn: (ctx: { db: number; }) => object |
    //     Promise<object>, destroy?: ...): Lunette<...>', gave the
    //     following error.
    //     Argument of type 'string' is not assignable to parameter of type
    //       '(ctx: { db: number; }) => object | Promise<object>'.
    //   Overload 2 of 2, '(key: "db" & { [collision]: "⛔ key already present
    //     in the context: db"; }, fn: ..., destroy?: ...): Lunette<...>',
    //     gave the following error.
    //     Argument of type '"db"' is not assignable to parameter of type
    //       '"db" & { [collision]: "⛔ key already present in the context:
    //       db"; }'.
    // Noisier than the single-overload prototype, but the patch candidate
    // is obviously irrelevant and the keyed elaboration carries the brand.
    // @ts-expect-error — keyed collision caught, wrapped in TS2769
    void lunette().provide('db', () => 1).provide('db', () => 'two')
  })

  it('patch collision: shape-picked overload, clean TS2322 — no wrapping', () => {
    //   error TS2322: Type '{ db: string; }' is not assignable to type
    //     '({ db: string; } & { [collision]: "⛔ key already present in the
    //     context: db"; }) | Promise<{ db: string; } & { [collision]: "⛔ key
    //     already present in the context: db"; }>'.
    //     Property '[collision]' is missing in type '{ db: string; }' but
    //       required in type '{ [collision]: "⛔ key already present in the
    //       context: db"; }'.
    // @ts-expect-error — patch collision caught, no overload noise
    void lunette().provide('db', () => 1).provide(() => ({ db: 'two' }))
  })

  it('async patch collision: the brand rides through the Promise', () => {
    //   error TS2322: Type 'Promise<{ db: string; }>' is not assignable to
    //     type '({ db: string; } & { [collision]: "⛔ key already present in
    //     the context: db"; }) | Promise<{ db: string; } & { [collision]: "⛔
    //     key already present in the context: db"; }>'.
    //     ...
    //     Property '[collision]' is missing in type '{ db: string; }' but
    //       required in type '{ [collision]: "⛔ key already present in the
    //       context: db"; }'.
    // @ts-expect-error — async patch collision caught
    void lunette().provide('db', () => 1).provide(async () => ({ db: 'two' }))
  })

  it('mount with unmet seed: the requirement brand in the elaboration', () => {
    //   error TS2769: No overload matches this call.
    //   Overload 1 of 4, '(layer: Layer<{}, object, object>): Lunette<...>',
    //     gave the following error. (the layer candidate: not a chain)
    //   Overload 2 of 4, '(chain: Lunette<{ env: Env; } & { auth: { url:
    //     string; }; }, { auth: { url: string; }; }, { env: Env; }> &
    //     { [requirement]: "⛔ fragment requirement not satisfied: env"; }):
    //     Lunette<...>', gave the following error.
    //     Property '[requirement]' is missing in type 'Lunette<...>' but
    //       required in type '{ [requirement]: "⛔ fragment requirement not
    //       satisfied: env"; }'.
    // @ts-expect-error — unmet seed caught, wrapped in TS2769
    void lunette().use(dxFrag)
  })

  it('layer whose patch collides: ctx stays typed, no TS7006 cascade', () => {
    //   error TS2769: No overload matches this call.
    //   Overload 1 of 4, '(layer: Layer<{ db: number; }, { db: string; },
    //     {}> & { [collision]: "⛔ key already present in the context: db"; }):
    //     Lunette<...>', gave the following error.
    //     Argument of type '(ctx: { db: number; }, next: Next) =>
    //       Promise<Provided<{ db: string; }, {}>>' is not assignable to ...
    // ctx is printed fully typed ({ db: number }) — contextual typing
    // survived the failed overload: NO TS7006 anywhere.
    // @ts-expect-error — layer collision caught, parameters still typed
    void lunette().provide('db', () => 1).use(async (ctx, next) => next({ db: 'x' }))
  })

  it('happy paths across the overloads: inference untouched', () => {
    void lunette()
      .provide('db', () => 1)
      .provide(async () => ({ mailer: 'm' }))
      .use('queue', async (ctx, next) => {
        expectTypeOf(ctx.db).toEqualTypeOf<number>()
        expectTypeOf(ctx.mailer).toEqualTypeOf<string>()
        return next([1, 2])
      })
      .use(async (ctx, next) => {
        expectTypeOf(ctx.queue).toEqualTypeOf<number[]>()
        return next({ done: true })
      })
      .expose(dxFrag, (ctx) => ({ env: { DATABASE_URL: `pg://${ctx.db}` } }))
      .provide('probe', (ctx) => {
        expectTypeOf(ctx.auth.url).toEqualTypeOf<string>()
        return true
      })
  })
})

// ── the brand property: a private symbol, not a string name ───────────────
// Found in review sparring: a STRING-keyed brand ({ collision: msg }) can
// be satisfied — deliberately, by writing the exact message into the
// patch (the guard lifts; only the runtime net catches the collision) —
// and it competes with a legitimate domain key named 'collision' (the
// error then demands the user's own property equal the guard message).
// The fix is the house idiom already used by providedBrand: the brand
// property is an UNEXPORTED unique symbol — nobody outside chain.ts can
// name it, so it cannot be produced (short of a cast, which defeats any
// guard, old return-type one included) and never meets user keys.
// Diagnostics print it as '[collision]' / '[requirement]'; the message
// value is unchanged. Contract: collision-guard.test-d.ts ("unforgeable").

describe('the brand property is a private symbol', () => {
  it('writing the exact message into the patch no longer compiles', () => {
    //   error TS2322: ...
    //     Property '[collision]' is missing in type '{ db: string;
    //     collision: "⛔ key already present in the context: db"; }' but
    //     required in type '{ [collision]: "⛔ key already present in the
    //     context: db"; }'.
    // (with the string brand this line COMPILED — the paradox that
    // triggered the refinement)
    // @ts-expect-error — the hand-written property is not the brand
    void lunette().provide(() => ({ db: 1 })).provide(() => ({
      db: 'two',
      collision: '⛔ key already present in the context: db' as const,
    }))
  })

  it('a user-side unique symbol with the same name is a different identity', () => {
    //   Property '[collision]' is missing in type '{ db: string;
    //     [collision]: "⛔ key already present in the context: db"; }' but
    //     required ... — the two '[collision]' are DIFFERENT symbols: the
    //     printed name collides, the identity does not.
    // @ts-expect-error — not the brand either
    void lunette().provide(() => ({ db: 1 })).provide(() => ({
      db: 'two',
      [fakeCollision]: '⛔ key already present in the context: db' as const,
    }))
  })

  it("a domain key named 'collision' neither lifts nor muddies the guard", () => {
    // no clash: an ordinary key, flows through
    void lunette().provide(() => ({ collision: { bodies: 2 } }))

    //   error TS2322: Type '{ db: string; collision: { bodies: number; }; }'
    //     is not assignable ... Property '[collision]' is missing ...
    // (with the string brand the demand was on the USER's property:
    //   Type '{ bodies: number; }' is not assignable to type
    //   '"⛔ key already present in the context: db"')
    // @ts-expect-error — the clash on db is reported, the domain key is left alone
    void lunette().provide(() => ({ db: 1 })).provide(() => ({
      db: 'two',
      collision: { bodies: 2 },
    }))
  })
})

// ── non-string keys: the message, and then the deeper hole ────────────────
// The PR #26 review caught the message collapsing for number and symbol
// keys: `${K & string}` is never for both, and interpolating never kills
// the whole template ({ [collision]: never } — red, but mute). Fixing it
// split the two kinds:
//
// SYMBOLS get a label. There is no `${symbol}` at the type level — a
// unique symbol has no name a template can print. The oracle killed the
// tempting alternative (carrying K in the brand payload so tsc prints
// the binding): inside the payload tsc prints an anonymous
// 'unique symbol', while the ARGUMENT side of the same diagnostic
// already prints 'typeof theSym' for free. So: label in the message,
// binding name from tsc itself.
//
// NUMBERS exposed a hole older than this PR: the runtime coerces 42 to
// "42" ({ 42: x } owns the string key), the type system keeps 42 and
// "42" distinct, so `.provide('42', …).provide(() => ({ 42: … }))` was
// GREEN under any PropertyKey-wide guard — and threw at runtime. No
// message fixes a key that lies; numeric keys are rejected outright.

declare const dxTenant: unique symbol

describe('non-string keys on the real chain', () => {
  it('symbol reuse: labelled message, binding named by tsc', () => {
    //   error TS2769: No overload matches this call.
    //   Overload 2 of 2, '(key: typeof dxTenant & { [collision]: "⛔ key
    //     already present in the context: (symbol key)"; }, fn: ...):
    //     Lunette<...>', gave the following error.
    //     Argument of type 'unique symbol' is not assignable to parameter
    //       of type 'unique symbol & { [collision]: "⛔ key already present
    //       in the context: (symbol key)"; }'.
    // @ts-expect-error — reused symbol caught; 'typeof dxTenant' names it
    void lunette().provide(dxTenant, () => 1).provide(dxTenant, () => 2)
  })

  it('numeric key, keyed form: banned at first use, named', () => {
    //   Overload 2 of 2, '(key: 42 & { [collision]: "⛔ numeric key not
    //     supported (it becomes a string at runtime): 42"; }, ...)', gave
    //     the following error.
    //     Argument of type '42' is not assignable to parameter of type
    //       '42 & { [collision]: "⛔ numeric key not supported (it becomes
    //       a string at runtime): 42"; }'.
    // @ts-expect-error — numbers are not keys
    void lunette().provide(42, () => 1)
  })

  it("the motivating hazard: '42' then { 42: … } was green and threw", () => {
    //   error TS2322: Type '{ 42: string; }' is not assignable to type
    //     '({ 42: string; } & { [collision]: "⛔ numeric key not supported
    //     (it becomes a string at runtime): 42"; }) | Promise<...>'.
    // @ts-expect-error — red at compile time now, not at boot
    void lunette().provide('42', () => 'a').provide(() => ({ 42: 'b' }))
  })

  it('an array as a patch falls under the same ban (unresolved template)', () => {
    //   ...required in type '{ [collision]: `⛔ numeric key not supported
    //     (it becomes a string at runtime): ${number}`; }'.
    // With a non-literal number the template stays GENERIC: tsc prints it
    // in backticks and the emoji degrades to its \u escape — the cosmetic
    // floor of the corner case, recorded honestly.
    // @ts-expect-error — keyof number[] includes number
    void lunette().provide(() => [1, 2])
  })
})
