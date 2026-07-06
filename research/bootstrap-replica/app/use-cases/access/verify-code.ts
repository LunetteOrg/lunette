import type {
  OtpRepository,
  SessionRepository,
  UserRegistration,
  UserRepository,
} from '../../domain/access.ts'
import {
  OtpExpired,
  OtpInvalid,
  OtpMaxAttemptsExceeded,
  RegistrationRequired,
} from '../../lib/errors.ts'
import { MAX_OTP_ATTEMPTS, SESSION_TTL_MS, verifyHash } from '../../lib/otp.ts'
import type { Tx } from '../../lib/tx.ts'

export type VerifyCodeDeps = {
  otpRepo: OtpRepository
  userRepo: UserRepository
  sessionRepo: SessionRepository
  generateId: () => string
}

export type VerifyCodeResult = {
  sessionId: string
  userId: string
  isNewUser: boolean
  locale: string | null
}

// The showcase leaf. Pure return-error: every DOMAIN outcome is RETURNED as a
// value; infrastructure failures (DbOperationFailed, UserCreateNoRows) THROW
// from the repos and propagate — so the surrounding transaction window rolls
// back. The branded `Tx<…>` deps mean this cannot be wired outside a window.
//
// The error convention's payoff: a wrong code RETURNS OtpInvalid *after*
// incrementing attempts, so that increment COMMITS; a db failure THROWS, so the
// partial state (user without session) ROLLS BACK. No manual "if infra throw"
// dance — the conventions do it.
export const verifyCode = async (
  deps: Tx<VerifyCodeDeps>,
  email: string,
  code: string,
  nonce?: string,
  registration?: Omit<UserRegistration, 'email'>,
): Promise<
  | VerifyCodeResult
  | OtpInvalid
  | OtpExpired
  | OtpMaxAttemptsExceeded
  | RegistrationRequired
> => {
  const record = await deps.otpRepo.findForUpdate(email)
  if (!record) return new OtpInvalid()
  if (nonce && record.nonce !== nonce) return new OtpInvalid()
  if (record.attempts >= MAX_OTP_ATTEMPTS) return new OtpMaxAttemptsExceeded()
  if (record.expiresAt.getTime() < Date.now()) return new OtpExpired()

  const existing = await deps.userRepo.findByEmail(email)
  if (!existing && !registration?.termsAccepted) return new RegistrationRequired()

  if (!verifyHash(code, record.codeHash)) {
    await deps.otpRepo.incrementAttempts(email) // committed on the domain path
    return new OtpInvalid()
  }

  const user =
    existing ??
    (await deps.userRepo.create({
      id: deps.generateId(),
      email,
      ...registration,
      termsAccepted: true,
    }))
  const session = await deps.sessionRepo.create({
    id: deps.generateId(),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
  await deps.otpRepo.consume(email)

  return { sessionId: session.id, userId: user.id, isNewUser: !existing, locale: user.locale }
}
