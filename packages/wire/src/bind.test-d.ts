import { describe, expectTypeOf, it } from 'vitest'
import { bind } from './index.ts'

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
  it('removes the deps parameter and keeps the rest of the signature', () => {
    const ctx = { otpRepo: { consume: async () => true }, extra: 1 }
    const auth = bind(ctx, { requestOtp })

    expectTypeOf(auth.requestOtp).toEqualTypeOf<
      (input: { email: string }) => Promise<'otp-sent'>
    >()
  })

  it('an entry with unsatisfied deps is an error ON THAT entry', () => {
    const ctx = { otpRepo: { consume: async () => true } }

    // @ts-expect-error — needsGhost requires ghost, absent from the context
    bind(ctx, { requestOtp, needsGhost })

    // the other entries are not penalized: without the broken entry it compiles
    bind(ctx, { requestOtp })
  })
})
