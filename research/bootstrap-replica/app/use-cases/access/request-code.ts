import type { OtpRepository } from '../../domain/access.ts'
import type { Mailer } from '../../lib/mailer/index.ts'
import { generateCode, hashCode, OTP_TTL_MS } from '../../lib/otp.ts'

export type RequestCodeDeps = { otpRepo: OtpRepository; mailer: Mailer }

// Bare leaf: deps-first, no make* factory. Issues a fresh code, stores its
// hash, mails the plaintext. Infrastructure failures (DbOperationFailed,
// MailSendFailed) THROW — there is no domain error here.
export const requestCode = async (
  deps: RequestCodeDeps,
  email: string,
  nonce?: string,
  _locale?: string,
): Promise<void> => {
  const code = generateCode()
  await deps.otpRepo.upsert({
    email,
    codeHash: hashCode(code),
    nonce: nonce ?? '',
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  })
  await deps.mailer.send({
    to: email,
    subject: 'Your sign-in code',
    body: `Your code is ${code}`,
  })
}
