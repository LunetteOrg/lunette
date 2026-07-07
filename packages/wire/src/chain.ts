// The chain: the Lunette class and its verbs, the layer types, and the
// compile-time guards. The API overview lives in index.ts.

type Patch = object

// A BRAND is a phantom property keyed by a private unique symbol: it
// exists only in the types (`declare const` emits nothing), and since
// the symbol is not exported, no code outside this module can name it —
// let alone write it. TypeScript's typing is structural; a brand is the
// standard trick to carve a nominal island in it. This file uses the
// trick in two distinct roles:
//   1. the OPAQUE TOKEN (providedBrand, here): a type nobody can
//      construct by hand, so the only way to produce a Provided is to
//      call `next` — forgetting `next` is a compile error, not a
//      silently broken chain;
//   2. the GUARDS (`collision`/`requirement` below): a deliberately
//      unsatisfiable demand whose string VALUE is the error message —
//      see "How a guard brand works" below.
declare const providedBrand: unique symbol

// The token carries TWO axes: All (everything the layer contributes, → Ctx)
// and Pub (the public subset, → Pub). `next(priv)` contributes privately;
// `next(priv, pub)` additionally publishes pub. Both surface in the layer's
// return type (reliable inference). A reserved third slot is the future
// passage point for a request-time Response.
export interface Provided<All, Pub = {}> {
  readonly [providedBrand]: [All, Pub]
}

export type Next = {
  <P extends Patch>(priv: P): Promise<Provided<P>>
  <Priv extends Patch, Pub extends Patch>(
    priv: Priv,
    pub: Pub,
  ): Promise<Provided<Priv & Pub, Pub>>
}

export type Layer<
  Ctx extends object,
  All extends Patch,
  Pub extends Patch = {},
> = (ctx: Ctx, next: Next) => Promise<Provided<All, Pub>>

// Keyed form of the verbs: the key is declared in the signature and next
// receives the VALUE, not a patch. Declaring the key makes the layer
// SKIPPABLE by test(chain): when the key is substituted, the function is
// never executed (no real connections, no missing dependencies in the
// test environment). Opt-in: the patch form remains the default.
export type NextValue = <V>(value: V) => Promise<Provided<V>>

export type ValueLayer<Ctx extends object, V> = (
  ctx: Ctx,
  next: NextValue,
) => Promise<Provided<V>>

const doneToken = {} as Provided<any>

// Patch keys already present in the context. If this is not never, the
// shallow merge would betray the intersection type: the check must fail.
export type Clash<Ctx, P> = Extract<keyof P, keyof Ctx>

// How a guard brand works. TypeScript has no custom type errors
// (decisions §4, "Horizon"), so the guards STAGE one: every guarded
// argument is intersected with a conditional brand —
//
//   provide<P>(fn: (ctx) => P & CollisionBrand<Ctx, P>)
//
// which resolves one of two ways:
//   - no collision → `unknown`, and `P & unknown = P`: the brand
//     vanishes and the signature reads as if it were not there (the
//     happy path pays nothing);
//   - collision → `{ [collision]: '⛔ key already present …: db' }`:
//     tsc now demands a property only this module can name, so the
//     argument can never satisfy it — THAT argument on THAT line is
//     rejected, and the diagnostic prints the missing property with its
//     string-literal value: the message, offending key included.
// The diagnostic therefore lives on the verb's ARGUMENT, not on its
// return type (decision in discussion #21; the evidence record is
// test/chain/collision-guard-dx.test-d.ts): the exact line goes red and
// the chain keeps typing downstream — no TS7006 cascade. The message
// rides a string-literal VALUE under the symbol key: emoji in property
// NAMES print as \u escapes in diagnostics, emoji in values print raw.
// The accepted trade: past the red line the accumulated Ctx is
// transiently wrong (an intersection the runtime would never produce),
// but the build stays red at the collision, so no green program ever
// lies.
// A key's name inside a message: strings verbatim; a symbol has no
// type-level name (`${symbol}` does not exist), so it is labelled — tsc
// still names its binding (`typeof theSym`) on the argument side of the
// same diagnostic, and the runtime nets always String() it.
type KeyLabel<K extends PropertyKey> = K extends string | number
  ? `${K}`
  : '(symbol key)'

// The message types are exported for the contract tests only (they are
// not re-exported by index.ts): the tests assert the exact text, and an
// import cannot drift the way a hand-written copy can.
export type DupKeyMsg<K extends PropertyKey> =
  `⛔ key already present in the context: ${KeyLabel<K>}`

// Numeric keys are rejected outright: the runtime coerces them to their
// string twin ({ 42: x } owns the key "42"), while the type system keeps
// 42 and "42" distinct — a green program could throw. Strings name,
// symbols give identity, numbers are not keys.
export type NumKeyMsg<K extends number> =
  `⛔ numeric key not supported (it becomes a string at runtime): ${K}`

export type NumKeys<P> = Extract<keyof P, number>

// The brand properties are unexported unique symbols (same idiom as
// providedBrand): a string-keyed brand could be satisfied — deliberately,
// by writing the exact message into the patch, or accidentally disturbed
// by a domain key with the same name. A symbol nobody can name is
// unforgeable short of a cast, and can never collide with user keys.
// Diagnostics print it as '[collision]' / '[requirement]'.
declare const collision: unique symbol
declare const requirement: unique symbol

// `any` disables the guard's reasoning: `keyof any` is every key, so
// without a dedicated branch `Extract` would flag EVERY key as "already
// present" — red for the wrong reason, a message asserting a falsehood.
// A guard that cannot check must say so: an any CONTEXT is refused by
// name. The degradation points themselves cannot go red on their own
// line — `any` absorbs every brand (`any & Brand = any`) — but an any
// PATCH turns the context to any and the next wiring line lands here,
// honestly. (An any KEY instead mints an index-signature context, which
// stays consistent with what the phantom type claims — the recorded
// residual in decisions §4; the runtime nets are the floor.)
// Two-stage detection. The canonical `0 extends 1 & T` idiom goes blind
// when T is a CONSTRAINED class type parameter instantiated with any
// (the constraint absorbs the intersection during member
// instantiation), while re-inferring T through a tuple restores the
// naked any — but costs more. So the cheap `keyof` test runs first as a
// pre-filter (only `any` or a context indexed by ALL THREE key kinds
// claims every PropertyKey, and the guards compute `keyof Ctx` anyway),
// and the exact tuple-infer confirm runs only when it fires — which is
// almost never. Without the confirm stage, a fully-indexed CONCRETE
// context (constructible from the public API: `lunette<Record<string,…>
// & Record<number,…> & Record<symbol,…>>()`) would be blamed as
// "degraded to any" — a lie; with it, that context gets the structural
// verdict its index signatures actually claim. Stays deferred for a
// still-generic T, so the decision-31 refusal is untouched.
type IsAny<T> = [string | number | symbol] extends [keyof T]
  ? 0 extends 1 & ([T] extends [infer U] ? U : never)
    ? true
    : false
  : false

// never is the other degenerate: `keyof never` is ALSO every key, so the
// keyof-based IsAny would blame a never context as "degraded to any" —
// factually wrong, and reachable without a cast: `provide(() => { throw
// new Error('todo') })` (a stub) infers a never patch, green at its own
// line (never absorbs the brand DOWNWARD, symmetric to any absorbing it
// upward), and collapses the context to never. The never check must
// therefore run BEFORE the any check.
type IsNever<T> = [T] extends [never] ? true : false

export type AnyCtxMsg =
  '⛔ context degraded to any: the guard cannot check keys — restore a real type'

export type NeverCtxMsg =
  '⛔ context collapsed to never: an upstream provider returns never — give it a real return type'

// Only override can print these two: its guard sits on the RETURN type,
// so a degenerate PATCH (any or never) is refusable at its own line —
// the sibling brands sit on the argument, where any absorbs the brand
// upward and never absorbs it downward, so honesty must wait for the
// next wiring line to see the degraded context.
export type AnyPatchMsg =
  '⛔ patch degraded to any: the guard cannot check keys — restore a real type'

export type NeverPatchMsg =
  '⛔ patch type is never: the function never returns — give it a real return type'

export type AnySeedMsg =
  '⛔ fragment seed degraded to any: the guard cannot check requirements — restore a real type'

export type NeverSeedMsg =
  '⛔ fragment seed collapsed to never — give it a real type'

// The never→any cascade every guard runs before its real work: never
// first (the keyof-based any-detection would swallow it), then any,
// then the guard's own verdict. Shared so the branch ORDER cannot drift
// between guards.
type DegeneracyOr<T, OnNever, OnAny, Then> = IsNever<T> extends true
  ? OnNever
  : IsAny<T> extends true
    ? OnAny
    : Then

// The tuple-wrap that judges a key set as a SET: one bad member is a
// verdict. A naked conditional would distribute over a union input and
// let a clean member collapse the whole verdict — the one idiom the two
// verdict shapes below must never drift apart on, so it lives once.
type WhenClean<Bad extends PropertyKey, Ok, Fail> = [Bad] extends [never]
  ? Ok
  : Fail

// The verdict every collision guard reduces to: a set of banned numeric
// keys, a set of colliding keys, both reporting TOGETHER as a union of
// messages (a side with no offender interpolates never and vanishes).
// Each key set is computed ONCE by the caller and passed in.
type CollisionVerdict<Num extends number, Dup extends PropertyKey> = WhenClean<
  Num | Dup,
  unknown,
  { [collision]: NumKeyMsg<Num> | DupKeyMsg<Dup> }
>

// Keyed form: the brand rejects the key argument itself.
type KeyBrand<Ctx, K extends PropertyKey> = DegeneracyOr<
  Ctx,
  { [collision]: NeverCtxMsg },
  { [collision]: AnyCtxMsg },
  CollisionVerdict<Extract<K, number>, Extract<K, keyof Ctx>>
>

// Patch form, two variants by WHERE the brand lands. In provide/expose
// it rides the patch VALUE itself: a degenerate P absorbs it (any
// upward, never downward), so a P-branch would be dead type code on the
// hottest verbs — honesty waits for the next wiring line, as pinned in
// the contract.
export type WidenedPatchMsg =
  '⛔ patch carries no nameable keys: mount the dynamic bag under a literal key'

// A TOP-LEVEL patch with keys but no NAMEABLE ones (an index-signature
// or key-pattern annotation — Record<string, …>) has no legitimate
// form: it would drop the collision check to boot, lie on absent reads,
// and poison keyof Ctx so every LATER literal provide reads "already
// present" — failing at the wrong line with the wrong message. Refused
// at its own line instead, with the cure in the text: mount the bag
// under ONE literal key, where the index signature lives inside the
// VALUE and the guard stays active for siblings (decision 32). The
// EMPTY patch is not widened (keyof never): it flows. Judged
// member-wise over a union, like every key set.
type HasNoNames<P> = P extends unknown
  ? [keyof P] extends [never]
    ? false
    : [LiteralOnly<keyof P>] extends [never]
      ? true
      : false
  : never

// The verdict expression both patch brands share — one definition, so a
// change to the key sets reaches both. The key sets DISTRIBUTE over a
// union-typed patch (reachable via an explicit `provide<A | B>(…)` type
// argument; annotated union returns are already refused by inference):
// `keyof` over a union keeps only the SHARED keys, so an undistributed
// set would let a colliding or numeric member through silently. Same
// convention as union seeds (UnmetSeedOf) and union keys (the
// tuple-wrapped verdict).
type ClashOf<Ctx, P> = P extends unknown ? Clash<Ctx, P> : never
type NumKeysOf<P> = P extends unknown ? NumKeys<P> : never

type PatchVerdict<Ctx, P> = true extends HasNoNames<P>
  ? { [collision]: WidenedPatchMsg }
  : CollisionVerdict<NumKeysOf<P>, ClashOf<Ctx, P>>

type AbsorbableCollisionBrand<Ctx, P> = DegeneracyOr<
  Ctx,
  { [collision]: NeverCtxMsg },
  { [collision]: AnyCtxMsg },
  PatchVerdict<Ctx, P>
>

// In use(layer) and the mount overloads the brand intersects a
// FUNCTION/CHAIN value, which is not degenerate even when its
// contribution is — the brand STICKS. Without the P-side branch it
// would fire with the verdict's artifacts (`NumKeys<any>` is `number` →
// 'numeric ${number}') instead of the real cause; here the branch is
// reachable and must be honest.
export type CollisionBrand<Ctx, P> = DegeneracyOr<
  Ctx,
  { [collision]: NeverCtxMsg },
  { [collision]: AnyCtxMsg },
  DegeneracyOr<
    P,
    { [collision]: NeverPatchMsg },
    { [collision]: AnyPatchMsg },
    PatchVerdict<Ctx, P>
  >
>

// Mount without a mapper: the host's Ctx must satisfy the fragment's
// Seed. The gate is the whole-object check; the message names the unmet
// keys — missing entirely (if required), or present with an
// incompatible type (a bare key difference would name nothing in the
// wrong-type case). `-?` de-homomorphizes the mapping: without it an
// optional seed key kept its `?` and indexing added a phantom
// `undefined` to the union, which KeyLabel printed as '(symbol key)'.
// An ABSENT optional key is not unmet (`{} extends Pick<FSeed, K>`
// spots the optionality) — the gate already accepts that case; the
// message must not contradict it. Exported for the contract tests only
// (not re-exported by index.ts).
export type UnmetSeed<Ctx, FSeed> = {
  [K in keyof FSeed]-?: K extends keyof Ctx
    ? Ctx[K] extends FSeed[K]
      ? never
      : K
    : {} extends Pick<FSeed, K>
      ? never
      : K
}[keyof FSeed]

// A UNION Seed means "any ONE of these alternatives": the gate accepts
// a host satisfying either member, and the unmet-key message must
// DISTRIBUTE over the members — `keyof` over a union keeps only the
// shared keys, so an undistributed UnmetSeed collapses to never and the
// message falls back to the nameless generic, naming nothing. Exported
// for the contract tests only.
export type UnmetSeedOf<Ctx, FSeed> = FSeed extends unknown
  ? UnmetSeed<Ctx, FSeed>
  : never

// An any seed makes `[Ctx] extends [FSeed]` trivially true: without the
// degeneracy gate a fragment's real requirements go entirely UNCHECKED
// — a silent pass, not a wrong message (decisions §4). The fragment
// chain value is not any even when its Seed parameter is, so the brand
// sticks and can refuse by name.
// INVARIANT: this brand checks FSeed's degeneracy only — a degenerate
// HOST context is CollisionBrand's job, and every overload that carries
// RequirementBrand also carries CollisionBrand<Ctx, FPub> (pinned:
// "mount is covered through the collision side"). A future overload
// using RequirementBrand alone must add the Ctx cascade itself.
export type RequirementBrand<Ctx, FSeed> = DegeneracyOr<
  FSeed,
  { [requirement]: NeverSeedMsg },
  { [requirement]: AnySeedMsg },
  [Ctx] extends [FSeed]
    ? unknown
    : {
        [requirement]: [UnmetSeedOf<Ctx, FSeed>] extends [never]
          ? '⛔ fragment requirements not satisfied'
          : `⛔ fragment requirement not satisfied: ${KeyLabel<UnmetSeedOf<Ctx, FSeed>>}`
      }
>

// The mapper doors to the same hole. A seed mapper returning any
// satisfies FSeed by plain assignability, so no gate would see it — a
// JSON.parse(...) mapper could mount a fragment with its requirements
// unchecked: S captures the mapper's INFERRED return; the brand
// intersects the mapper's function value (not any — the RETURN is), so
// it sticks and refuses by name. The mapper overloads' CHAIN argument
// carries SeedBrand<FSeed> for the symmetric door: with a degenerate
// DECLARED seed, `S extends FSeed` is vacuous and a clean mapper would
// smuggle the fragment in unchecked.
type SeedBrand<S> = DegeneracyOr<
  S,
  { [requirement]: NeverSeedMsg },
  { [requirement]: AnySeedMsg },
  unknown
>

// Mirror guard for override: only keys that already exist can be
// replaced (a typo in the name does not go unnoticed), and the numeric
// ban holds here too — a numeric slot can only pre-exist via a declared
// Seed or a cast (decision 30's residual), and re-typing a slot whose
// identity already lies is refused. Same verdict shape as the collision
// guards (both kinds report as one union, never vanishes), but this one
// still lives on the RETURN type — moving it onto the argument is a
// separate decision (#25 scopes the argument-side move to the collision
// guard) — and its brand is the plain ASCII key 'override'.
// A WIDENED patch annotation (an index signature or key pattern —
// Record<string, …>, Record<symbol, …>, Record<`data-${string}`, …>)
// carries no nameable keys: Exclude does not reduce them away, so
// without this filter a literal check would read every
// actually-existing key as "missing" — a false positive. Widened types
// are the runtime net's territory (decisions §4): the filter drops
// them MEMBER-WISE — `{}` extends `Record<K, 1>` exactly when K is
// satisfiable by omission (an index signature / pattern), while
// literals, numbers and unique symbols demand their property and stay.
type LiteralOnly<K extends PropertyKey> = K extends unknown
  ? {} extends Record<K, 1>
    ? never
    : K
  : never

type UnknownKeys<Ctx, P> = LiteralOnly<Exclude<keyof P, keyof Ctx>>

type UnknownKeysOf<Ctx, P> = P extends unknown ? UnknownKeys<Ctx, P> : never

export type MissingKeyMsg<K extends PropertyKey> =
  `⛔ overriding key missing from the context: ${KeyLabel<K>}`

type OverrideVerdict<
  Num extends number,
  Missing extends PropertyKey,
  Result,
> = WhenClean<
  Num | Missing,
  Result,
  { override: NumKeyMsg<Num> | MissingKeyMsg<Missing> }
>

// Override cannot run blind either. A degenerate CONTEXT (never from a
// throw-only stub upstream, any from an untyped seed) makes "only
// existing keys" unknowable; a degenerate PATCH falling through to the
// verdict would report the degraded input's artifacts as real findings
// ('numeric ${number}' | 'missing ${string}' — factually wrong on both
// counts). This guard's return position can refuse ALL FOUR at the
// offending line (no brand to absorb); the context wins the blame when
// both sides are degenerate, since it degraded first.
type OverrideGuard<Ctx, P, Result> = DegeneracyOr<
  Ctx,
  { override: NeverCtxMsg },
  { override: AnyCtxMsg },
  DegeneracyOr<
    P,
    { override: NeverPatchMsg },
    { override: AnyPatchMsg },
    // key sets distributed over a union-typed patch, like PatchVerdict
    OverrideVerdict<NumKeysOf<P>, UnknownKeysOf<Ctx, P>, Result>
  >
>

// After an override the replaced keys keep their visibility: the ones
// that were public stay in Pub, with the new type.
type OverriddenPub<Pub, P> = Omit<Pub, keyof P> &
  Pick<P, Extract<keyof P, keyof Pub>>

type Entry =
  | {
      kind: 'layer'
      layer: Layer<any, any, any>
      mode: 'extend' | 'override'
      public: boolean
      // present only in the keyed form: makes the layer skippable in tests
      key: PropertyKey | undefined
    }
  | {
      kind: 'mount'
      entries: readonly Entry[]
      seedFn: ((ctx: object) => object) | undefined
      public: boolean
      // renames the Pub at the boundary (the .as sugar): the fragment's
      // whole Pub enters under this key instead of its own keys
      at: PropertyKey | undefined
    }

// Flattens the accumulated intersections ({} & {db} & {auth} → a flat
// object) at the points of consumption: readable tooltips and exact type
// comparisons in tests.
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export type Scope<Pub, T> = (app: Expand<Pub>) => T | Promise<T>

// If the chain has no external requirements ({} satisfies them), the seed
// is omitted; otherwise it is prepended as the first, mandatory argument.
type SeedArgs<Seed extends object, Rest extends unknown[]> = {} extends Seed
  ? Rest
  : [seed: Seed, ...Rest]

type RunArgs<Seed extends object, Pub extends object, T> = SeedArgs<
  Seed,
  [scope: Scope<Pub, T>]
>

type BuildArgs<Seed extends object> = SeedArgs<Seed, []>

// PropertyKey: context keys may also be Symbols — identity-based
// uniqueness for those who want it; the engine treats them like strings
// (guards, expose and mount included). Numeric keys are rejected at the
// type level (see NumKeyMsg); the runtime nets still catch whatever
// slips in through casts or numeric-keyed seeds.
type Bag = Record<PropertyKey, unknown>

// Adapts the keyed form (next receives the value) to the patch machinery.
const keyedToLayer =
  (key: PropertyKey, l: ValueLayer<any, any>): Layer<any, any> =>
  (ctx, next) =>
    l(ctx, ((value: unknown) =>
      next({ [key]: value })) as NextValue) as Promise<Provided<any>>

// A merge that preserves the bag's prototype (a spread would lose it):
// own keys stay own, reads keep falling through to the host along the
// prototype chain.
const merge = (ctx: Bag, patch: object): Bag =>
  Object.assign(Object.create(Object.getPrototypeOf(ctx)) as Bag, ctx, patch)

// Copies a selection of keys from a source bag into a fresh plain object.
const pick = (source: Bag, keys: Iterable<PropertyKey>): Bag => {
  const out: Bag = {}
  for (const key of keys) out[key] = source[key]
  return out
}

export class Lunette<
  Ctx extends object = {},
  Pub extends object = {},
  Seed extends object = {},
> {
  private constructor(private readonly entries: readonly Entry[]) {}

  static create<Seed extends object = {}>(): Lunette<Seed, {}, Seed> {
    return new Lunette<Seed, {}, Seed>([])
  }

  use<All extends Patch, P extends Patch>(
    layer: Layer<Expand<Ctx>, All, P> & CollisionBrand<Ctx, All>,
  ): Lunette<Ctx & All, Pub & P, Seed>
  use<K extends PropertyKey, V>(
    key: K & KeyBrand<Ctx, K>,
    l: ValueLayer<Expand<Ctx>, V>,
  ): Lunette<Ctx & Record<K, V>, Pub, Seed>
  use<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed> &
      RequirementBrand<Ctx, FSeed> &
      CollisionBrand<Ctx, FPub>,
  ): Lunette<Ctx & FPub, Pub, Seed>
  use<
    FCtx extends object,
    FPub extends object,
    FSeed extends object,
    S extends FSeed,
  >(
    chain: Lunette<FCtx, FPub, FSeed> &
      CollisionBrand<Ctx, FPub> &
      SeedBrand<FSeed>,
    seed: ((ctx: Expand<Ctx>) => S) & SeedBrand<S>,
  ): Lunette<Ctx & FPub, Pub, Seed>
  use(
    arg: Layer<any, any> | Lunette<any, any, any> | PropertyKey,
    extra?: ((ctx: any) => object) | ValueLayer<any, any>,
  ): any {
    if (arg instanceof Lunette) {
      return this.mount(arg.entries, extra as ((ctx: object) => object) | undefined, false)
    }
    if (typeof arg === 'function') {
      return this.push({ kind: 'layer', layer: arg, mode: 'extend', public: false, key: undefined })
    }
    return this.push({
      kind: 'layer',
      layer: keyedToLayer(arg, extra as ValueLayer<any, any>),
      mode: 'extend',
      public: false,
      key: arg,
    })
  }

  // Sugar over `use`: a private value, with an optional acquire/release
  // teardown as the trailing argument (patch form receives the patch, keyed
  // form receives the value).
  provide<P extends Patch>(
    fn: (
      ctx: Expand<Ctx>,
    ) => (P & AbsorbableCollisionBrand<Ctx, P>) | Promise<P & AbsorbableCollisionBrand<Ctx, P>>,
    destroy?: (value: P) => void | Promise<void>,
  ): Lunette<Ctx & P, Pub, Seed>
  provide<K extends PropertyKey, V>(
    key: K & KeyBrand<Ctx, K>,
    fn: (ctx: Expand<Ctx>) => V | Promise<V>,
    destroy?: (value: V) => void | Promise<void>,
  ): Lunette<Ctx & Record<K, V>, Pub, Seed>
  provide(
    arg: ((ctx: any) => unknown) | PropertyKey,
    extra?: ((ctx: any) => unknown) | ((value: any) => unknown),
    destroy?: (value: any) => unknown,
  ): any {
    return this.sugar(false, arg, extra, destroy)
  }

  // Sugar over `use`: a public value, with an optional acquire/release
  // teardown (same shape as `provide`). Also accepts a CHAIN to mount its
  // whole Pub publicly.
  expose<P extends Patch>(
    fn: (
      ctx: Expand<Ctx>,
    ) => (P & AbsorbableCollisionBrand<Ctx, P>) | Promise<P & AbsorbableCollisionBrand<Ctx, P>>,
    destroy?: (value: P) => void | Promise<void>,
  ): Lunette<Ctx & P, Pub & P, Seed>
  expose<K extends PropertyKey, V>(
    key: K & KeyBrand<Ctx, K>,
    fn: (ctx: Expand<Ctx>) => V | Promise<V>,
    destroy?: (value: V) => void | Promise<void>,
  ): Lunette<Ctx & Record<K, V>, Pub & Record<K, V>, Seed>
  expose<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed> &
      RequirementBrand<Ctx, FSeed> &
      CollisionBrand<Ctx, FPub>,
  ): Lunette<Ctx & FPub, Pub & FPub, Seed>
  expose<
    FCtx extends object,
    FPub extends object,
    FSeed extends object,
    S extends FSeed,
  >(
    chain: Lunette<FCtx, FPub, FSeed> &
      CollisionBrand<Ctx, FPub> &
      SeedBrand<FSeed>,
    seed: ((ctx: Expand<Ctx>) => S) & SeedBrand<S>,
  ): Lunette<Ctx & FPub, Pub & FPub, Seed>
  expose(
    arg: ((ctx: any) => unknown) | Lunette<any, any, any> | PropertyKey,
    extra?: ((ctx: any) => unknown) | ((value: any) => unknown),
    destroy?: (value: any) => unknown,
  ): any {
    if (arg instanceof Lunette) {
      return this.mount(arg.entries, extra as ((ctx: object) => object) | undefined, true)
    }
    return this.sugar(true, arg, extra, destroy)
  }

  // Appends one entry to the chain, wrapping the grown list in a fresh
  // Lunette. The single place that spreads `this.entries`.
  private push(entry: Entry): Lunette<any, any, any> {
    return new Lunette([...this.entries, entry])
  }

  // Shared body of `use`/`expose`'s mount overloads: appends a mount entry
  // carrying the fragment's entries, the optional seed mapper, and the
  // visibility the host verb chose (use = private, expose = public).
  private mount(
    entries: readonly Entry[],
    seedFn: ((ctx: object) => object) | undefined,
    isPublic: boolean,
  ): Lunette<any, any, any> {
    return this.push({ kind: 'mount', entries, seedFn, public: isPublic, at: undefined })
  }

  // Shared body of `provide`/`expose`'s non-mount overloads: same wiring,
  // differing only in whether `next` also publishes (the second argument)
  // and the entry's `public` flag.
  private sugar(
    isPublic: boolean,
    arg: ((ctx: any) => unknown) | PropertyKey,
    extra: ((ctx: any) => unknown) | ((value: any) => unknown) | undefined,
    destroy: ((value: any) => unknown) | undefined,
  ): Lunette<any, any, any> {
    const keyed = typeof arg !== 'function'
    // Function form: `arg` is the worker, `extra` the teardown, no key.
    // Keyed form: `arg` is the key, `extra` the worker, `destroy` the teardown.
    const key = keyed ? arg : undefined
    const fn = (keyed ? extra : arg) as (ctx: any) => unknown
    const teardown = (keyed ? destroy : extra) as
      | ((value: any) => unknown)
      | undefined
    const wrapped: Layer<any, any, any> = async (ctx, next) => {
      const value = await fn(ctx)
      // Patch shape: the bare value (function form) or { [key]: value }.
      const patch = (keyed ? { [key!]: value } : value) as Patch
      try {
        return isPublic ? await next({}, patch) : await next(patch)
      } finally {
        if (teardown) await teardown(value)
      }
    }
    return this.push({ kind: 'layer', layer: wrapped, mode: 'extend', public: isPublic, key })
  }

  // Namespacing sugar for mounting: `host.use(frag.as('hb'))` mounts the
  // fragment with its whole Pub under the chosen key. It is the wrapper
  // `lunette().use(frag).expose(...)` in one word; the Seed propagates.
  as<N extends PropertyKey>(
    name: N,
  ): Lunette<Record<N, Expand<Pub>>, Record<N, Expand<Pub>>, Seed> {
    return new Lunette([
      { kind: 'mount', entries: this.entries, seedFn: undefined, public: true, at: name },
    ]) as Lunette<Record<N, Expand<Pub>>, Record<N, Expand<Pub>>, Seed>
  }

  override<P extends Patch>(
    fn: (ctx: Expand<Ctx>) => P | Promise<P>,
  ): OverrideGuard<
    Ctx,
    P,
    Lunette<Omit<Ctx, keyof P> & P, OverriddenPub<Pub, P>, Seed>
  > {
    const wrapped: Layer<any, any> = async (ctx, next) => next(await fn(ctx))
    return this.push({
      kind: 'layer',
      layer: wrapped,
      mode: 'override',
      public: false,
      key: undefined,
    }) as OverrideGuard<
      Ctx,
      P,
      Lunette<Omit<Ctx, keyof P> & P, OverriddenPub<Pub, P>, Seed>
    >
  }

  // The ecosystem hook: hands the chain to a "dialect" (http, cli,
  // flow...) which from there on owns the signature and behaviour of its
  // own verbs. Zero type tax on the core: pipe returns whatever the
  // dialect returns.
  pipe<R>(fn: (chain: this) => R): R {
    return fn(this)
  }

  async run<T>(...args: RunArgs<Seed, Pub, T>): Promise<T> {
    const argv = args as unknown[]
    const seed = (argv.length === 2 ? argv[0] : {}) as Bag
    const scope = (argv.length === 2 ? argv[1] : argv[0]) as Scope<Pub, T>
    return this.execute({ ...seed }, new Set(), scope)
  }

  // Execution path for tests (see `test()` in @lntt/wire/testing): the
  // `subst` keys are already in the root bag with their fake values; when
  // a layer provides one of those keys, its patch for that key is DROPPED
  // at birth — downstream layers wire against the fake. Top level only:
  // fragment privates stay encapsulated (test the fragment to test those).
  private async execute<T>(
    rootBag: Bag,
    subst: ReadonlySet<PropertyKey>,
    scope: Scope<Pub, T>,
  ): Promise<T> {
    // Shared clash check: keys of `patch` that are already OWN keys of
    // `ctx` cannot be shallow-merged; each caller supplies its own message.
    const assertNoClash = (
      ctx: Bag,
      patch: Bag,
      message: (clashes: PropertyKey[]) => string,
    ): void => {
      const clashes = Reflect.ownKeys(patch).filter((key) =>
        Object.hasOwn(ctx, key),
      )
      if (clashes.length > 0) throw new Error(message(clashes))
    }
    // Walks a chain (or a mounted fragment). Every level has its own bag
    // and its own set of public keys; `done` is the continuation: for the
    // top level it is the app scope, for a fragment it is "resume the
    // host's walk with the fragment's Pub".
    const walk = async (
      entries: readonly Entry[],
      bag: Bag,
      publicKeys: Set<PropertyKey>,
      // substitutions active at THIS level (empty inside fragments)
      level: ReadonlySet<PropertyKey>,
      done: (finalBag: Bag, publicKeys: Set<PropertyKey>) => Promise<Provided<any>>,
    ): Promise<Provided<any>> => {
      const dropSubstituted = (patch: Bag): Bag => {
        if (level.size === 0) return patch
        return pick(
          patch,
          Reflect.ownKeys(patch).filter((key) => !level.has(key)),
        )
      }
      const step = async (i: number, ctx: Bag): Promise<Provided<any>> => {
        const entry = entries[i]
        if (entry === undefined) return done(ctx, publicKeys)

        if (entry.kind === 'mount') {
          // The fragment's bag: either the mapper's explicit seed, or
          // lexical scoping (reads fall through to the host via the
          // prototype; writes are own keys, so same-named keys shadow
          // instead of colliding).
          const base: Bag = entry.seedFn
            ? { ...entry.seedFn(ctx) }
            : (Object.create(ctx) as Bag)
          return walk(entry.entries, base, new Set(), new Set(), async (childBag, childPub) => {
            const pub = pick(childBag, childPub)
            const full: Bag = entry.at !== undefined ? { [entry.at]: pub } : pub
            const patch = dropSubstituted(full)
            assertNoClash(
              ctx,
              patch,
              (clashes) =>
                `The fragment's public surface collides with host context keys: ${clashes.map(String).join(', ')}.`,
            )
            if (entry.public)
              for (const key of Reflect.ownKeys(full)) publicKeys.add(key)
            return step(i + 1, merge(ctx, patch))
          })
        }

        // Keyed form with a substituted key: the layer is SKIPPED entirely
        // (the function never runs: no real resources in tests).
        if (entry.key !== undefined && level.has(entry.key)) {
          if (entry.public) publicKeys.add(entry.key)
          return step(i + 1, ctx)
        }

        const next = (async (priv: Patch, pub?: Patch) => {
          const full = (
            pub === undefined ? priv : { ...priv, ...pub }
          ) as Bag
          const patch = dropSubstituted(full)
          if (entry.mode === 'extend') {
            // hasOwn, not `in`: host keys (on the prototype) may be
            // shadowed, keys of THIS level may not.
            assertNoClash(
              ctx,
              patch,
              (clashes) =>
                `Keys already present in the context: ${clashes.map(String).join(', ')}. ` +
                'Merging is shallow: use one top-level key per area, ' +
                'or override to replace intentionally.',
            )
            // Visibility comes from the SECOND argument: the public subset.
            // The sugar verbs route their public patch there (expose →
            // next({}, patch)); the keyed-skip fast path uses entry.public
            // for the case where the layer never runs.
            if (pub !== undefined)
              for (const key of Reflect.ownKeys(pub)) publicKeys.add(key)
          } else {
            // For override `in` is right: a seed key (on the prototype)
            // is legitimately replaceable too.
            const keys = Reflect.ownKeys(full)
            const unknowns = keys.filter((key) => !(key in ctx))
            if (unknowns.length > 0) {
              throw new Error(
                `Cannot override keys missing from the context: ${unknowns.map(String).join(', ')}.`,
              )
            }
          }
          return step(i + 1, merge(ctx, patch))
        }) as Next
        return entry.layer(ctx, next)
      }
      return step(0, bag)
    }

    let result!: T
    await walk(this.entries, rootBag, new Set(), subst, async (ctx, publicKeys) => {
      const app = pick(ctx, publicKeys)
      result = await scope(app as Expand<Pub>)
      return doneToken
    })
    return result
  }

  // Internal access for `test()`: a static of the same class may touch
  // private members of its instances.
  static testRun<
    Ctx extends object,
    Pub extends object,
    Seed extends object,
    T,
  >(
    chain: Lunette<Ctx, Pub, Seed>,
    input: Seed & Partial<Expand<Ctx>>,
    scope: Scope<Pub, T>,
  ): Promise<T> {
    const bag = { ...(input as Bag) }
    return chain.execute(bag, new Set(Reflect.ownKeys(bag)), scope)
  }

  async build(
    ...args: BuildArgs<Seed>
  ): Promise<{ app: Expand<Pub>; dispose: () => Promise<void> }> {
    const seed = ((args as unknown[])[0] ?? {}) as Seed
    let app!: Expand<Pub>
    let ready!: () => void
    let release!: () => void
    const readiness = new Promise<void>((resolve) => {
      ready = resolve
    })
    const lifetime = new Promise<void>((resolve) => {
      release = resolve
    })
    const runUnchecked = this.run.bind(this) as (
      seed: Seed,
      scope: Scope<Pub, void>,
    ) => Promise<void>
    const finished = runUnchecked(seed, async (pub) => {
      app = pub
      ready()
      await lifetime
    })
    // If a layer fails during construction, run rejects before the chain
    // ever reaches the end.
    await Promise.race([readiness, finished])
    return {
      app,
      dispose: async () => {
        release()
        await finished
      },
    }
  }
}

export const lunette = <Seed extends object = {}>(): Lunette<Seed, {}, Seed> =>
  Lunette.create<Seed>()

// Identity helper for defining reusable layers outside a chain (loggers,
// debuggers, shared infrastructure): annotate ONLY ctx — the requirements
// — and next/patch are inferred. Runtime: (l) => l.
export const layer = <
  Ctx extends object,
  All extends Patch,
  Pub extends Patch = {},
>(
  l: Layer<Ctx, All, Pub>,
): Layer<Ctx, All, Pub> => l
