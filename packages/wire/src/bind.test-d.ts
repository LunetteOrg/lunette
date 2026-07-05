import { describe, expectTypeOf, it } from 'vitest'
import { bind, type With } from './index.ts'

type OtpRepo = { consume: (code: string) => Promise<boolean> }

const requestOtp = async (
  _deps: { otpRepo: OtpRepo },
  input: { email: string },
) => {
  void input
  return 'otp-sent' as const
}

const needsGhost = (_deps: { ghost: { boo: () => void } }, _x: number) => true

describe('bind (types)', () => {
  it('the applied binder removes the deps parameter, keeps the rest', () => {
    const ctx = { otpRepo: { consume: async () => true }, extra: 1 }
    const auth = bind({ requestOtp })(ctx)

    expectTypeOf(auth.requestOtp).toEqualTypeOf<
      (input: { email: string }) => Promise<'otp-sent'>
    >()
  })

  it("the binder's parameter is the INTERSECTION of the leaves' deps", () => {
    const ctx = { otpRepo: { consume: async () => true } }

    // ghost is missing from ctx: the APPLICATION does not compile. The
    // blame is aggregate (the missing KEY is named, not which leaf wants
    // it) — the accepted trade of single-arity bind.
    // @ts-expect-error — ctx does not provide 'ghost'
    bind({ requestOtp, needsGhost })(ctx)

    // without the demanding entry, the same ctx applies fine
    bind({ requestOtp })(ctx)
  })

  it('one arity only: there is no second argument to forget', () => {
    const ctx = { otpRepo: { consume: async () => true } }

    // the old two-argument form is an arity error, not a silent rebind
    // @ts-expect-error — bind takes exactly one argument, the record
    bind(ctx, { requestOtp })
  })

  it('a window is not a record: the naked verb rejects it outright', () => {
    const win: With<{ otpRepo: OtpRepo }> = (use) =>
      use({ otpRepo: { consume: async () => true } })

    // per-call binding goes through .with — the window cannot reach the
    // naked verb by mistake (a function has no string index signature)
    // @ts-expect-error — bind wants a record of leaves, not a window
    bind(win)

    bind({ requestOtp }).with(win)
  })

  it('a bare leaf without braces is rejected at the call', () => {
    // The braces are the NAME CARRIER (a function's name is runtime-only,
    // so `bind(leaf)` could never produce a typed record — see decision
    // 28d). Forgetting them is an immediate error, tsc 5.9 verbatim:
    //   error TS2345: Argument of type '(deps: …) => Promise<…>' is not
    //     assignable to parameter of type 'Record<string, Leaf>'.
    //   Index signature for type 'string' is missing in type '(deps: …)…'.
    // @ts-expect-error — a leaf without braces has no key to publish under
    bind(requestOtp)
  })

  it('forgetting to APPLY is kind-visible: a binder is not a record', () => {
    // spreading the unapplied binder yields no leaves — the Pub simply
    // does not contain them, and every downstream use is an error. The
    // type never lies; the mistake surfaces where the record is demanded.
    const spread = { ...bind({ requestOtp }) }
    expectTypeOf<keyof typeof spread>().toEqualTypeOf<'with' | 'by'>()
  })
})
