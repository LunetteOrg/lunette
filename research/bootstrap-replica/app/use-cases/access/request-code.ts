import type { OtpRepository } from '../../domain/access.ts'
import type { SendMail } from '../../lib/mailer/index.ts'
import { generateCode, hashCode, OTP_TTL_MS } from '../../lib/otp.ts'

export type RequestCodeDeps = { otpRepo: OtpRepository; sendMail: SendMail }

// Bare leaf: deps-first, no make* factory. Issues a fresh code, stores its
// hash, mails the plaintext. Infrastructure failures (DbOperationFailed,
// MailSendFailed) THROW — there is no domain error here.
// Deliberate deviation from the source's form: the dep is the BOUND
// sending leaf (function vocabulary), not a mailer service object.
export const requestCode = async (
  { otpRepo, sendMail }: RequestCodeDeps,
  email: string,
  nonce?: string,
  _locale?: string,
): Promise<void> => {
  const code = generateCode()
  await otpRepo.upsert({
    email,
    codeHash: hashCode(code),
    nonce: nonce ?? '',
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  })
  await sendMail({
    to: email,
    subject: 'Your sign-in code',
    body: `Your code is ${code}`,
  })
}
