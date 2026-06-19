// bind: one-word registration. Flat use cases (deps, ...args), bound to
// the context inside an expose; adding a use case to the app = adding
// its name to the record. Destructuring the deps is plain JavaScript:
// no lunette feature involved.

import { describe, expect, it } from 'vitest'
import { bind, lunette } from './index.ts'

type OtpRepo = { consume: (code: string) => Promise<boolean> }
type SendEmail = (to: string) => Promise<void>

// flat use cases, destructuring the deps in the parameter
const requestOtp = async (
  { otpRepo, sendEmail }: { otpRepo: OtpRepo; sendEmail: SendEmail },
  input: { email: string },
) => {
  void otpRepo
  await sendEmail(input.email)
  return 'otp-sent' as const
}

const verifyOtp = async (
  { otpRepo }: { otpRepo: OtpRepo },
  email: string,
  code: string,
) => ((await otpRepo.consume(code)) ? { session: email } : new Error('invalid'))

describe('bind', () => {
  it('binds the deps and keeps the remaining arguments', async () => {
    const sent: string[] = []
    const ctx = {
      otpRepo: { consume: async (code: string) => code === '1234' },
      sendEmail: async (to: string) => {
        sent.push(to)
      },
      extra: 'extra keys do not get in the way',
    }

    const auth = bind(ctx, { requestOtp, verifyOtp })

    expect(await auth.requestOtp({ email: 'a@b.c' })).toBe('otp-sent')
    expect(sent).toEqual(['a@b.c'])
    expect(await auth.verifyOtp('a@b.c', '1234')).toEqual({ session: 'a@b.c' })
    expect(await auth.verifyOtp('a@b.c', '0000')).toBeInstanceOf(Error)
  })

  it('inside an expose: the bootstrap registers in one word', async () => {
    const app = await lunette()
      .provide(() => ({
        otpRepo: { consume: async (code: string) => code === '1234' },
        sendEmail: async (_to: string) => {},
      }))
      .expose((ctx) => ({ auth: bind(ctx, { requestOtp, verifyOtp }) }))
      .run(async (pub) => pub)

    expect(await app.auth.requestOtp({ email: 'x@y.z' })).toBe('otp-sent')
    expect(Object.keys(app)).toEqual(['auth'])
  })
})
