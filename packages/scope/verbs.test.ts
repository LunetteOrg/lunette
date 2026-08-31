
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

  it('says its WORD on the scope`s intent axis — the fail-open closed for raw steps, closed here too', () => {
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
    // becomes the message. A string has no call signatures, so the error lands
    // on this line and prints the reason; nothing downstream has to touch the
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
