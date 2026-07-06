// bind: one-word registration. Flat use cases (deps, ...args); bind(record)
// returns the BINDER — apply it for fixed deps, pass it point-free to
// expose/provide (the binder is shaped like a provider), reuse it as a kit.
// Destructuring the deps is plain JavaScript: no lunette feature involved.

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
  it('applied binder: binds the deps and keeps the remaining arguments', async () => {
    const sent: string[] = []
    const ctx = {
      otpRepo: { consume: async (code: string) => code === '1234' },
      sendEmail: async (to: string) => {
        sent.push(to)
      },
      extra: 'extra keys do not get in the way',
    }

    const auth = bind({ requestOtp, verifyOtp })(ctx)

    expect(await auth.requestOtp({ email: 'a@b.c' })).toBe('otp-sent')
    expect(sent).toEqual(['a@b.c'])
    expect(await auth.verifyOtp('a@b.c', '1234')).toEqual({ session: 'a@b.c' })
    expect(await auth.verifyOtp('a@b.c', '0000')).toBeInstanceOf(Error)
  })

  it('the binder is a provider: point-free expose, ctx as the deps', async () => {
    const app = await lunette()
      .provide(() => ({
        otpRepo: { consume: async (code: string) => code === '1234' },
        sendEmail: async (_to: string) => {},
      }))
      .expose(bind({ requestOtp, verifyOtp }))
      .run(async (pub) => pub)

    expect(await app.requestOtp({ email: 'x@y.z' })).toBe('otp-sent')
    expect(Object.keys(app).sort()).toEqual(['requestOtp', 'verifyOtp'])
  })

  it('inside a keyed expose: the namespaced bootstrap registers in one word', async () => {
    const app = await lunette()
      .provide(() => ({
        otpRepo: { consume: async (code: string) => code === '1234' },
        sendEmail: async (_to: string) => {},
      }))
      .expose('auth', (ctx) => bind({ requestOtp, verifyOtp })(ctx))
      .run(async (pub) => pub)

    expect(await app.auth.requestOtp({ email: 'x@y.z' })).toBe('otp-sent')
    expect(Object.keys(app)).toEqual(['auth'])
  })

  it('the binder is a first-class kit: one record, many worlds', async () => {
    const kit = bind({ verifyOtp })

    const strict = kit({ otpRepo: { consume: async () => false } })
    const lenient = kit({ otpRepo: { consume: async () => true } })

    expect(await strict.verifyOtp('a@b.c', 'x')).toBeInstanceOf(Error)
    expect(await lenient.verifyOtp('a@b.c', 'x')).toEqual({ session: 'a@b.c' })
  })
})
