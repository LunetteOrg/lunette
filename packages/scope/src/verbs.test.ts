import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  scope,
  type AnyStep,
  type Extension,
  type Next,
  type Scope,
  type State,
  type Surface,
} from './index.ts'

// AN EXTENSION enriches the BUILDER, and only the builder. That is the whole
// split, and it is visible in the runtime: `.step` appends to the fold,
// `.extend` appends to nothing — it registers verbs, and the fold work happens
// when a verb is CALLED.
//
//   .step(fn)      acts on the FLOW      → the step list grows
//   .extend(ext)   acts on the BUILDER   → the step list does not
//
// So `.extend` is not a second primitive. `.step` is still the only thing that
// ever adds to the fold, and an extension never appears in the step list —
// which is a claim this file checks rather than asserts.

// ── what a verb produces: an ordinary step ───────────────────────────────────
// A factory, from its own arguments TO A STEP. It never sees the builder or a
// callback to rebuild it: pushing the step is the core's job, and that was the
// only thing any verb ever did with them.
const withHeader =
  (name: string, value: string) =>
  async (_app: {}, _ctx: {}, next: Next<{}>) => {
    // A DECORATING wrap, which is the one shape that pays for the fold
    // producing nothing of its own: `next` hands back a `Passed` that says
    // nothing, so the step states what it expects. A real carrier does this
    // once, in a helper, and every decorator it ships is written against the
    // carrier's own type (§42).
    const out = (await next({})) as unknown as string
    return `${out} [${name}=${value}]`
  }

// ── what the extension declares ──────────────────────────────────────────────
// `this: Surface<S>` is how a verb reads the scope it was called on without
// knowing it. That works because this is a METHOD call — on the scope's own
// call signature `this` binds to `void`, which is the reason the accumulated
// state lives in a type parameter at all.
interface HeaderVerb {
  header<S extends State>(this: Scope<S>, name: string, value: string): Surface<S>
}

const headers: Extension<HeaderVerb> = {
  methods: { header: withHeader as unknown as (...a: never[]) => AnyStep },
}

// ── a GENERIC verb, which is why signatures are DECLARED and not computed ────
// Computing a verb's signature from its factory removes a duplicate, and costs
// the generics: `infer` through a generic factory instantiates its type
// parameters to their constraints, so this one would report `number` where it
// should report `201`. Measured, and pinned below.
const withPin =
  <N extends number>(n: N) =>
  async (_app: {}, _ctx: {}, next: Next<{ pinned: N }>) =>
    next({ pinned: n })

interface PinVerb {
  pin<S extends State, N extends number>(
    this: Scope<S>,
    n: N,
  ): Surface<{
    need: S['need']
    args: S['args']
    acc: S['acc'] & { readonly pinned: N }
    returns: S['returns']
    vocabulary: S['vocabulary']
    verbs: S['verbs']
  }>
}

const pins: Extension<PinVerb> = {
  methods: { pin: withPin as unknown as (...a: never[]) => AnyStep },
}

// ── the way past the ctx gate, and the reason it may be closed at all ────────
// `.step` refuses re-populating a key, because it cannot tell a refinement from
// a collision. An extension CAN tell — it is the one saying so — and it does not
// come through `.step`: `.extend`'s wrapper pushes the step directly, so a verb
// declaring its own state transformation replaces an entry the primitive may
// only add to. This is what makes the gate affordable rather than a wall, and it
// is the shape a validation verb will have.
const narrowBody = () =>
  async (_app: {}, ctx: { readonly body: unknown }, next: Next<{ body: { id: string } }>) =>
    next({ body: ctx.body as { id: string } })

interface NarrowVerb {
  narrow<S extends State>(
    this: Scope<S>,
  ): Surface<{
    need: S['need']
    args: S['args']
    // REPLACES, where `Grown` would intersect — an `Omit`, exactly as `Ctx` does
    // for the args axis, and legible here because the verb states it.
    acc: Omit<S['acc'], 'body'> & { readonly body: { id: string } }
    returns: S['returns']
    vocabulary: S['vocabulary']
    verbs: S['verbs']
  }>
}

const narrows: Extension<NarrowVerb> = {
  methods: { narrow: narrowBody as unknown as (...a: never[]) => AnyStep },
}

describe('an extension replaces a ctx entry where a step may not', () => {
  it('narrows a key an earlier step populated, and the leaf reads the narrow type', async () => {
    const h = scope<{}>()
      .step(async (_app: {}, _ctx: {}, next: Next<{ body: unknown }>) => next({ body: { id: 'p1' } }))
      .extend(narrows)
      .narrow()
      .step(async (_app: {}, ctx: { readonly body: { id: string } }) => ctx.body.id)

    expect(await h({}, {})).toBe('p1')
  })

  it('and the same thing written as a STEP is refused, which is the whole point', () => {
    const refused = () => {
      scope<{}>()
        .step(async (_a: {}, _c: {}, next: Next<{ body: unknown }>) => next({ body: {} }))
        // @ts-expect-error ⛔ this ctx key is already populated: body
        .step(async (_a: {}, _c: {}, next: Next<{ body: { id: string } }>) =>
          next({ body: { id: 'p1' } }),
        )
    }
    expect(typeof refused).toBe('function')
  })
})

describe('an extension enriches the builder, and nothing else', () => {
  it('adds NO step — that is the difference from `.step`, and it is observable', () => {
    const bare = scope<{}>()
    const extended = bare.extend(headers)
    expect(extended.steps).toHaveLength(0)
    expect(extended.steps).toEqual(bare.steps)

    // and calling the verb is what adds one
    expect(extended.header('x', '1').steps).toHaveLength(1)
  })

  it('puts the verb on the builder, and calling it pushes its step', async () => {
    const h = scope<{}>()
      .extend(headers)
      .header('x-served-by', 'lntt')
      .step(async (_app: {}, _ctx: {}) => 'body')

    expect(await h({}, {})).toBe('body [x-served-by=lntt]')
  })

  it('the verb`s step runs WHERE IT WAS CALLED, like every other step', async () => {
    const h = scope<{}>()
      .extend(headers)
      .header('a', '1')
      .header('b', '2')
      .step(async (_app: {}, _ctx: {}) => 'body')

    expect(await h({}, {})).toBe('body [b=2] [a=1]')
  })

  it('the verb is not there before the extension that declares it', () => {
    // Type-only, and NEVER CALLED: the expect-error directive silences the
    // COMPILER, not the runtime, so running the line below would really look up
    // a method that is not there and throw.
    const refused = () => {
      // @ts-expect-error — nothing has contributed `.header` yet
      scope<{}>().header('x', '1')
    }
    expect(typeof refused).toBe('function')
  })
})

describe('a verb keeps its generics, which is why its signature is written out', () => {
  it('pins the literal a computed signature would have widened', async () => {
    const h = scope<{}>().extend(pins).pin(201)

    // `201`, not `number`. A signature computed from the factory reports the
    // constraint here — measured side by side, and the reason the duplicate
    // stays.
    h.step(async (_app: {}, ctx, _next: Next<{}>) => {
      expectTypeOf(ctx.pinned).toEqualTypeOf<201>()
      return ctx.pinned
    })

    const out = await h.step(async (_app: {}, ctx: { readonly pinned: 201 }) => ctx.pinned)({}, {})
    expect(out).toBe(201)
  })

  it('grows the ctx for the steps after it, exactly as a step would', () => {
    scope<{ readonly token: string }>()
      .extend(pins)
      .pin(404)
      .step(async (_app: {}, ctx, _next: Next<{}>) => {
        expectTypeOf(ctx.pinned).toEqualTypeOf<404>()
        expectTypeOf(ctx.token).toEqualTypeOf<string>()
        return ctx.pinned
      })
  })
})

describe('a verb cannot take a name the surface already owns', () => {
  // `Surface<S> = Scope<S> & S['verbs']` intersects where it ought to conflict,
  // so neither of these is visible to the type system without `VerbGate` — and
  // both are silent at runtime, which is why they are pinned here.
  const shadowsStep = {
    methods: { step: () => (async () => 'from-verb') as unknown as AnyStep },
  } as unknown as Extension<{ step(): unknown }>

  it('is REFUSED at the call site — the gate, and the only half that matters in TS', () => {
    const refused = () => {
      // @ts-expect-error ⛔ a verb cannot be named: step — the scope's own surface owns it
      scope<{}>().extend(shadowsStep)
    }
    expect(typeof refused).toBe('function')
  })

  // The two below reach the runtime the only way anything can once the gate is
  // in place: by lying to it. That is not a contrived setup — it is what an
  // extension loaded by name, or assembled from data, or written in plain JS
  // looks like from in here, and it is the whole reason the runtime half
  // exists.
  const unchecked = (ext: object) => scope<{}>().extend(ext as unknown as Extension<{}>)

  it('refuses one shadowing `.step`, which would otherwise DISCARD the step it is given', () => {
    expect(() => unchecked(shadowsStep)).toThrow(/cannot be named 'step'/)
  })

  it('refuses one named `bind`, which assignment does NOT protect — it shadows silently', () => {
    // `name` is an own, non-writable property, so that one at least threw.
    // `bind` is inherited from `Function.prototype`: assigning over it succeeds,
    // and `myScope.bind(null, app)` then hands back a step-pushing builder
    // instead of a bound function, at whatever call site expected a function.
    const shadowsBind = {
      methods: { bind: () => (async () => 'x') as unknown as AnyStep },
    }
    expect(() => unchecked(shadowsBind)).toThrow(/cannot be named 'bind'/)
  })

  it('refuses one named `toString`, which would otherwise break every interpolation', () => {
    // Shadowing it with a verb makes `String(scope)` throw `Cannot convert
    // object to primitive value` — from the template literal, never from here.
    const shadowsToString = {
      methods: { toString: () => (async () => 'x') as unknown as AnyStep },
    }
    expect(() => unchecked(shadowsToString)).toThrow(/cannot be named 'toString'/)
  })

  it('refuses one named `then`, which would otherwise make every scope a THENABLE', () => {
    // The worst of the three categories, and the only one that stops rather
    // than degrades. `await` on an object carrying `then` calls it with
    // `(resolve, reject)`; the verb wrapper reads those as the verb's own
    // arguments, pushes a step and hands back a builder, resolving nothing.
    const shadowsThen = {
      methods: { then: () => (async () => 'x') as unknown as AnyStep },
    }
    expect(() => unchecked(shadowsThen)).toThrow(/cannot be named 'then'/)
  })

  it('refuses one named `__proto__`, which would REPLACE the scope`s prototype', () => {
    // The third way a name can fail, and the reason the list is grouped by
    // failure rather than by origin. `__proto__` is an inherited ACCESSOR:
    // assigning to it runs the setter, so the wrapper becomes the scope's
    // [[Prototype]] and no property is installed. The verb silently does not
    // exist, and the scope keeps working in every visible way, because what it
    // now inherits from is itself a function.
    //
    // Only reachable as an OWN key — an object literal's `__proto__` sets the
    // prototype instead of making one — so this is built the way a `methods`
    // map from data would be, which is what the runtime half is for.
    const methods: Record<string, unknown> = {}
    Object.defineProperty(methods, '__proto__', {
      value: () => (async () => 'x') as unknown as AnyStep,
      enumerable: true,
      writable: true,
      configurable: true,
    })
    expect(() => unchecked({ methods })).toThrow(/cannot be named '__proto__'/)
  })

  it('refuses one named `valueOf`, from the half of the prototype chain that is not a function`s', () => {
    // `Object.prototype`, which the list had missed while claiming to be
    // closed over "what every function carries".
    const shadowsValueOf = {
      methods: { valueOf: () => (async () => 'x') as unknown as AnyStep },
    }
    expect(() => unchecked(shadowsValueOf)).toThrow(/cannot be named 'valueOf'/)
  })

  it('refuses one named `name`, which would otherwise throw from inside the core', () => {
    // A function's `name` is not writable, so this used to surface as
    // `TypeError: Cannot assign to read only property 'name' of function` —
    // pointing at `make`, never at the extension that caused it.
    const shadowsName = {
      methods: { name: () => (async () => 'x') as unknown as AnyStep },
    }
    expect(() => unchecked(shadowsName)).toThrow(/cannot be named 'name'/)
  })
})

// ── a scope is not a thenable ────────────────────────────────────────────────
// What guards the VERB case is the refusal above; this pins the INVARIANT that
// refusal exists to protect, and would catch it being broken from the other
// direction — the builder itself growing a `then`, for whatever reason seemed
// good at the time.
//
// It races against a timeout on purpose. The failure mode here is not an
// assertion going red but a promise that never settles, which a runner reports
// as a timeout minutes later or not at all; 200ms turns that into a red line
// that says which case hung.
describe('awaiting a scope', () => {
  const settles = (v: unknown) =>
    Promise.race([
      Promise.resolve(v).then(() => 'settled' as const),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 200)),
    ])

  it('settles — a scope carries no `then`, so it is not a thenable', async () => {
    expect(await settles(scope<{}>())).toBe('settled')
    expect(await settles(scope<{}>().extend(headers))).toBe('settled')
    expect(await settles(scope<{}>().step(async (_a: {}, _c: {}) => 'v'))).toBe('settled')
  })

  it('and an `async` function may return one, which is how the hang would reach a caller', async () => {
    const build = async () => scope<{}>().extend(headers).header('x', '1')
    expect(await settles(build())).toBe('settled')
  })
})

// ── two extensions cannot both own a verb name ───────────────────────────────
// The two halves used to disagree and neither said so. `Surface` intersects, so
// a shared name becomes an OVERLOAD LIST where TypeScript prefers the EARLIER
// signature for arguments it accepts; `.extend`'s merge is `{ ...verbs,
// ...ext.methods }` and keeps the LATER factory. So the call site was checked
// against one extension and served by the other.
interface TagString {
  tag<S extends State>(this: Scope<S>, v: string): Surface<S>
}
interface TagNumber {
  tag<S extends State>(this: Scope<S>, v: number): Surface<S>
}

const ran: string[] = []
const tagFactory = (which: string) => (v: unknown) =>
  (async (_a: {}, _c: {}, next: Next<{}>) => {
    ran.push(`${which}:${typeof v}`)
    return next({})
  }) as unknown as AnyStep

const tagsA: Extension<TagString> = { methods: { tag: tagFactory('A') as (...a: never[]) => AnyStep } }
const tagsB: Extension<TagNumber> = { methods: { tag: tagFactory('B') as (...a: never[]) => AnyStep } }

describe('a verb name already contributed by another extension', () => {
  it('is REFUSED at the second `.extend`, naming it', () => {
    const refused = () => {
      // @ts-expect-error ⛔ a verb under this name is already contributed: tag
      scope<{}>().extend(tagsA).extend(tagsB)
    }
    expect(typeof refused).toBe('function')
  })

  it('and refused at RUNTIME too, the way an extension loaded by name reaches it', () => {
    const unchecked = (ext: object) =>
      scope<{}>().extend(tagsA).extend(ext as unknown as Extension<{}>)
    expect(() => unchecked(tagsB)).toThrow(/already contributed: tag/)
  })

  it('the same extension twice is refused as well — it is the same collision', () => {
    const refused = () => {
      // @ts-expect-error ⛔ a verb under this name is already contributed: header
      scope<{}>().extend(headers).extend(headers)
    }
    expect(typeof refused).toBe('function')
  })

  it('two extensions with DIFFERENT names compose, which is the case that must not break', async () => {
    const h = scope<{}>()
      .extend(headers)
      .extend(pins)
      .header('x', '1')
      .pin(201)
      .step(async (_app: {}, ctx: { readonly pinned: 201 }) => String(ctx.pinned))

    expect(await h({}, {})).toBe('201 [x=1]')
  })
})

// ── the alphabet is closed, and this is what proves it ───────────────────────
// It has declared closure three times and been short three times — first
// `Function.prototype`, then the protocol names, then the accessors — and each
// miss was a CATEGORY, never a single name. Three reviews found them one at a
// time.
//
// So this does not compare the list against another list written by hand. It
// derives the QUESTION from the runtime — every name actually reachable on a
// scope, walked off the real prototype chain — and asks the gate to answer.
// A category that nobody thought of is still on that chain, so it is still
// asked about.
//
// If a future runtime adds a member to `Function.prototype`, this goes red.
// That is not a false alarm: the alphabet would really be short again.
//
// WHAT IT DOES NOT COVER, and the limit is worth stating rather than implying
// closure it cannot give: a name the LANGUAGE gives meaning to is not on any
// prototype, so `then` is absent from the walk and would be absent from a
// successor's. Three of the four categories are enumerable from the runtime and
// are closed here; the fourth stays a judgement, and its one member is pinned
// by name above. Verified by deleting each category in turn — the sweep goes
// red naming what went missing, except that one.
describe('every name reachable on a scope is refused as a verb', () => {
  const unchecked = (name: string) =>
    scope<{}>().extend({
      methods: { [name]: () => (async () => 'x') as unknown as AnyStep },
    } as unknown as Extension<{}>)

  // What a scope IS: a function, with everything a function inherits.
  const reachable = [
    ...Object.getOwnPropertyNames(function named() {}),
    ...Object.getOwnPropertyNames(Function.prototype),
    ...Object.getOwnPropertyNames(Object.prototype),
  ].filter((n) => n !== 'caller' && n !== 'arguments')
  // `caller`/`arguments` are own properties of `Function.prototype` in sloppy
  // mode only and are poisoned accessors in strict mode; they are IN the list
  // and cannot be probed by assignment, so they are checked by name below.

  it('refuses every one of them, so no category can be missing', () => {
    const accepted = reachable.filter((name) => {
      try {
        unchecked(name)
        return true
      } catch {
        return false
      }
    })
    expect(accepted).toEqual([])
  })

  it('and the two names that cannot be probed are on the list anyway', () => {
    for (const name of ['caller', 'arguments']) {
      expect(() => unchecked(name)).toThrow(new RegExp(`cannot be named '${name}'`))
    }
  })

  it('the sweep is not vacuous — an ordinary name still passes', () => {
    expect(() => unchecked('header')).not.toThrow()
  })
})
