import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope } from './base.ts'
import { fixture, refused } from './carrier.fixture.ts'
import type { Next, StepValue } from './primitive.ts'

// A VERB — the fourth thing a step may say, and the only one that is not about
// the fold at all. The other three (what it knows of the app and of the ctx,
// what it populates) are about ONE RUN. A verb is about the BUILDER: adding the
// step puts a new method on the chain, for whoever writes the scope.
//
// The builder's side of a verb is COMPUTED from the factory, never declared
// beside it — and computed from what the factory RETURNS, not only from its
// arguments. A factory is `(...args) => a step`, so the method is `(...args) =>
// whatever `.step` would have produced for that step`. That makes a verb
// literally `.step` with its arguments curried, which is the claim, and it is
// what keeps a verb's step checked like any other.
//
// Reading only the argument list was the first shape, and it left three holes
// at once — each measured, and each pinned below: the WORD its step says was
// dropped, what it POPULATES was dropped, and what it REQUIRES of the ctx was
// checked by nothing.

// ── the confusion this file exists to remove ─────────────────────────────────
// TWO steps are involved, and reading them as one is what makes this shape
// opaque. Written apart:
//
//   (a) the DECLARING step. At runtime it does nothing: it calls `next({})` and
//       passes through. Its whole job is to CARRY the verb, so that adding it
//       puts `.header()` on the builder. It is an OBJECT — `{ run, methods }` —
//       because a declaration is a value here, not a phantom attached to a
//       function with `Object.assign` and a cast.
//
//   (b) the step the VERB PUSHES — what `header('x', 'y')` returns. An ordinary
//       wrapping step, exactly shape 4 in `shapes.test.ts`: it lets the rest run
//       and decorates what came back.
//
// So `next` appears in (b) for the same reason it appears in any wrapping step,
// and not in (a) for any reason at all. The verb itself is neither: it is a
// plain function from its own arguments TO A STEP. It never sees the builder's
// state, because pushing the step is the core's job — and that was the only
// thing any verb ever did with them.

// (b) — what the verb produces. A wrapping step, nothing more.
const withHeader =
  (name: string, value: string) =>
  async (_app: {}, _ctx: {}, next: Next<{}>) => {
    const out = await next({})
    // Spreading keeps the fold's brand, so what comes back is still the fold's
    // own outcome and not a look-alike.
    return out.ok ? { ...out, value: `${String(out.value)} [${name}=${value}]` } : out
  }

// (a) — the declaring step. Passes through; carries the verb.
//
// That a pure declaration still has to BE a step is the price of having exactly
// one primitive: a closure per run that does nothing. The alternative is a
// second category of thing the builder accepts, which is the thing this design
// spent its whole budget removing.
const passThrough = async (_app: {}, _ctx: {}, next: Next<{}>) => next({})

const headers = {
  run: passThrough,
  methods: { header: withHeader },
} satisfies StepValue<typeof passThrough>

describe('a step that contributes a verb', () => {
  it('puts the verb on the builder, and calling it pushes a step', async () => {
    const h = scope<{}>()
      .step(headers)
      .header('x-served-by', 'lntt')
      .step(async (_app: {}, _ctx: {}) => 'body')

    expect(await h({}, {}).then((o) => o.ok && o.value)).toBe('body [x-served-by=lntt]')
  })

  it('the verb`s step runs WHERE IT WAS CALLED, like every other step', async () => {
    // Called after the leaf-bearing part of the chain would be too late to
    // decorate it — so the order is the order, and nothing is hoisted.
    const h = scope<{}>()
      .step(headers)
      .header('a', '1')
      .header('b', '2')
      .step(async (_app: {}, _ctx: {}) => 'body')

    expect(await h({}, {}).then((o) => o.ok && o.value)).toBe('body [b=2] [a=1]')
  })

  it('the verb is not there before the step that declares it', () => {
    // Type-only, and NEVER CALLED: the expect-error directive silences the
    // COMPILER, not the runtime, so running the line below would really look up
    // a method that is not there and throw. The assertion is that the body does
    // not compile without the directive — which the mutation test checks — so
    // this function exists to be typechecked and for nothing else.
    const refused = () => {
      // @ts-expect-error — nothing has contributed `.header` yet
      scope<{}>().header('x', '1')
    }
    expect(typeof refused).toBe('function')
  })
})

// ── what a verb's step declares, and why reading only its arguments was wrong ─
// A verb that GUARDS rather than decorates: it reads the ctx, can stop with one
// of the carrier's words, and hands an enrichment inward. Everything a raw step
// can say, said from inside a verb.
const withMinLength =
  (min: number) =>
  async (_app: {}, ctx: { readonly token: string | null }, next: Next<{ len: number }>) => {
    const len = (ctx.token ?? '').length
    return len < min ? refused('token too short') : next({ len })
  }

const lengths = {
  run: passThrough,
  methods: { atLeast: withMinLength },
} satisfies StepValue<typeof passThrough>

describe('a verb`s step is checked like any other', () => {
  const guarded = scope(fixture).step(lengths).atLeast(3)

  it('says its WORD on the scope`s intent axis — the fail-open closed here too', () => {
    // Not `never`. Reading only the factory's arguments dropped this, so a
    // scope aborting inside a verb's step passed a host gate that could not
    // render it — the exact silent degrade the intent axis exists to remove.
    expectTypeOf(guarded.__int).toEqualTypeOf<((i: 'refusal') => 'refusal') | undefined>()
  })

  it('populates the ctx for the steps after it', async () => {
    const h = guarded.step(async (_app: {}, ctx, _next: Next<{}>) => {
      expectTypeOf(ctx.len).toEqualTypeOf<number>()
      return ctx.len
    })
    expect(await h({}, { token: 'abcd', params: {} }).then((o) => o.ok && o.value)).toBe(4)
  })

  it('stops the fold with its word when it refuses', async () => {
    const h = guarded.step(async (_app: {}, ctx: { readonly len: number }) => ctx.len)
    const out = await h({}, { token: 'ab', params: {} })
    expect(out.ok).toBe(false)
    expect(!out.ok && 'abort' in out && out.abort.intent).toEqual({
      kind: 'refused',
      why: 'token too short',
    })
  })

  it('is REFUSED when it reads a ctx the scope has not got', () => {
    // The one gate that cannot ride an argument — a verb's step is not an
    // argument of anything, the builder manufactures it — so the METHOD ITSELF
    // becomes the message. It has no call signatures, so the error lands on
    // this line and prints the reason; nothing downstream has to touch the
    // result for it to fire, which is what §2 asks of a gate.
    const readsNothingWeHave =
      (n: number) =>
      async (_app: {}, ctx: { readonly nowhere: string }, next: Next<{}>) =>
        next({ n, x: ctx.nowhere } as never)
    const bad = {
      run: passThrough,
      methods: { missing: readsNothingWeHave },
    } satisfies StepValue<typeof passThrough>

    const refuse = () => {
      // @ts-expect-error ⛔ this verb reads a ctx this scope has not got
      scope(fixture).step(bad).missing(1)
    }
    expect(typeof refuse).toBe('function')
  })
})
