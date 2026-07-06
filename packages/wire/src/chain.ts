// The chain: the Lunette class and its verbs, the layer types, and the
// compile-time guards. The API overview lives in index.ts.

type Patch = object

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
// shallow merge would betray the intersection type: the chain stops here.
type Clash<Ctx, P> = Extract<keyof P, keyof Ctx>

// Shared guard shape: a passing check (never) yields the Result; a failing
// one yields a single-key error object naming the offending keys.
type KeyGuard<Check, Message extends string, Result> = [Check] extends [never]
  ? Result
  : Record<Message, Check>

type Guard<Ctx, P, Result> = KeyGuard<
  Clash<Ctx, P>,
  '⛔ keys already present in the context',
  Result
>

// Mirror guard for override: only keys that already exist can be
// replaced (a typo in the name does not go unnoticed).
type UnknownKeys<Ctx, P> = Exclude<keyof P, keyof Ctx>

type OverrideGuard<Ctx, P, Result> = KeyGuard<
  UnknownKeys<Ctx, P>,
  '⛔ overriding keys missing from the context',
  Result
>

// After an override the replaced keys keep their visibility: the ones
// that were public stay in Pub, with the new type.
type OverriddenPub<Pub, P> = Omit<Pub, keyof P> &
  Pick<P, Extract<keyof P, keyof Pub>>

// Mount without a mapper: the host's Ctx must satisfy the fragment's Seed.
type MountGuard<Ctx, FSeed, Result> = [Ctx] extends [FSeed]
  ? Result
  : {
      '⛔ fragment requirements not satisfied': Pick<
        FSeed,
        Exclude<keyof FSeed, keyof Ctx>
      >
    }

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

// If the chain has no external requirements ({} satisfies them), run only
// wants the scope; otherwise the seed is the first, mandatory argument.
type RunArgs<Seed extends object, Pub extends object, T> = {} extends Seed
  ? [scope: Scope<Pub, T>]
  : [seed: Seed, scope: Scope<Pub, T>]

type BuildArgs<Seed extends object> = {} extends Seed ? [] : [seed: Seed]

// PropertyKey: context keys may also be Symbols — identity-based
// uniqueness for those who want it; the engine treats them like strings
// (guards, expose and mount included).
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
    layer: Layer<Expand<Ctx>, All, P>,
  ): Guard<Ctx, All, Lunette<Ctx & All, Pub & P, Seed>>
  use<K extends PropertyKey, V>(
    key: K,
    l: ValueLayer<Expand<Ctx>, V>,
  ): Guard<Ctx, Record<K, V>, Lunette<Ctx & Record<K, V>, Pub, Seed>>
  use<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed>,
  ): MountGuard<Ctx, FSeed, Guard<Ctx, FPub, Lunette<Ctx & FPub, Pub, Seed>>>
  use<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed>,
    seed: (ctx: Expand<Ctx>) => FSeed,
  ): Guard<Ctx, FPub, Lunette<Ctx & FPub, Pub, Seed>>
  use(
    arg: Layer<any, any> | Lunette<any, any, any> | PropertyKey,
    extra?: ((ctx: any) => object) | ValueLayer<any, any>,
  ): any {
    if (arg instanceof Lunette) {
      return this.mount(arg.entries, extra as ((ctx: object) => object) | undefined, false)
    }
    if (typeof arg === 'function') {
      return new Lunette([
        ...this.entries,
        { kind: 'layer', layer: arg, mode: 'extend', public: false, key: undefined },
      ])
    }
    return new Lunette([
      ...this.entries,
      { kind: 'layer', layer: keyedToLayer(arg, extra as ValueLayer<any, any>), mode: 'extend', public: false, key: arg },
    ])
  }

  // Sugar over `use`: a private value, with an optional acquire/release
  // teardown as the trailing argument (patch form receives the patch, keyed
  // form receives the value).
  provide<P extends Patch>(
    fn: (ctx: Expand<Ctx>) => P | Promise<P>,
    destroy?: (value: P) => void | Promise<void>,
  ): Guard<Ctx, P, Lunette<Ctx & P, Pub, Seed>>
  provide<K extends PropertyKey, V>(
    key: K,
    fn: (ctx: Expand<Ctx>) => V | Promise<V>,
    destroy?: (value: V) => void | Promise<void>,
  ): Guard<Ctx, Record<K, V>, Lunette<Ctx & Record<K, V>, Pub, Seed>>
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
    fn: (ctx: Expand<Ctx>) => P | Promise<P>,
    destroy?: (value: P) => void | Promise<void>,
  ): Guard<Ctx, P, Lunette<Ctx & P, Pub & P, Seed>>
  expose<K extends PropertyKey, V>(
    key: K,
    fn: (ctx: Expand<Ctx>) => V | Promise<V>,
    destroy?: (value: V) => void | Promise<void>,
  ): Guard<Ctx, Record<K, V>, Lunette<Ctx & Record<K, V>, Pub & Record<K, V>, Seed>>
  expose<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed>,
  ): MountGuard<Ctx, FSeed, Guard<Ctx, FPub, Lunette<Ctx & FPub, Pub & FPub, Seed>>>
  expose<FCtx extends object, FPub extends object, FSeed extends object>(
    chain: Lunette<FCtx, FPub, FSeed>,
    seed: (ctx: Expand<Ctx>) => FSeed,
  ): Guard<Ctx, FPub, Lunette<Ctx & FPub, Pub & FPub, Seed>>
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

  // Shared body of `use`/`expose`'s mount overloads: appends a mount entry
  // carrying the fragment's entries, the optional seed mapper, and the
  // visibility the host verb chose (use = private, expose = public).
  private mount(
    entries: readonly Entry[],
    seedFn: ((ctx: object) => object) | undefined,
    isPublic: boolean,
  ): Lunette<any, any, any> {
    return new Lunette([
      ...this.entries,
      { kind: 'mount', entries, seedFn, public: isPublic, at: undefined },
    ])
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
    return new Lunette([
      ...this.entries,
      { kind: 'layer', layer: wrapped, mode: 'extend', public: isPublic, key },
    ])
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
    return new Lunette([
      ...this.entries,
      { kind: 'layer', layer: wrapped, mode: 'override', public: false, key: undefined },
    ]) as OverrideGuard<
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
        const kept: Bag = {}
        for (const key of Reflect.ownKeys(patch)) {
          if (!level.has(key)) kept[key] = patch[key]
        }
        return kept
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
            const pub: Bag = {}
            for (const key of childPub) pub[key] = childBag[key]
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
      const app: Bag = {}
      for (const key of publicKeys) app[key] = ctx[key]
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
