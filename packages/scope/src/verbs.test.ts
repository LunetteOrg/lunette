import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope, type Scope, type State, type Surface } from './scope.ts'
import type { AnyStep, Extension, Next } from './step.ts'

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
    const out = await next({})
    // Spreading keeps the fold's brand, so what comes back is still the fold's
    // own outcome and not a look-alike.
    return out.ok ? { ...out, value: `${String(out.value)} [${name}=${value}]` } : out
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
    seed: S['seed']
    acc: S['acc'] & { readonly pinned: N }
    result: S['result']
    intents: S['intents']
    declares: S['declares']
    verbs: S['verbs']
  }>
}

const pins: Extension<PinVerb> = {
  methods: { pin: withPin as unknown as (...a: never[]) => AnyStep },
}

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

    expect(await h({}, {}).then((o) => o.ok && o.value)).toBe('body [x-served-by=lntt]')
  })

  it('the verb`s step runs WHERE IT WAS CALLED, like every other step', async () => {
    const h = scope<{}>()
      .extend(headers)
      .header('a', '1')
      .header('b', '2')
      .step(async (_app: {}, _ctx: {}) => 'body')

    expect(await h({}, {}).then((o) => o.ok && o.value)).toBe('body [b=2] [a=1]')
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
    expect(out.ok && out.value).toBe(201)
  })

  it('grows the ctx for the steps after it, exactly as a step would', () => {
    scope<{ readonly seed: string }>()
      .extend(pins)
      .pin(404)
      .step(async (_app: {}, ctx, _next: Next<{}>) => {
        expectTypeOf(ctx.pinned).toEqualTypeOf<404>()
        expectTypeOf(ctx.seed).toEqualTypeOf<string>()
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
