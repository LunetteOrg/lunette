import { describe, expect, it } from 'vitest'
import { scope } from './base.ts'
import type { Next, StepValue } from './primitive.ts'

// A VERB — the fifth thing a step may say, and the only one that is not about
// the fold at all. The other four (what it knows, what it populates, whether it
// terminates) are about ONE RUN. A verb is about the BUILDER: adding the step
// puts a new method on the chain, for whoever writes the scope.
//
// The builder's side of a verb is COMPUTED from the factory, never declared
// beside it: a factory is `(...args) => a step`, so the method is
// `(...args) => the builder`. A hand-written signature was a duplicate of that
// argument list which could drift from it with no error anywhere.

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
