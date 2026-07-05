import { bind, lunette, window } from '@lntt/wire'
import type { Db } from '../db/client.ts'
import { otpRepo } from '../db/repos/otp.repo.ts'
import { sessionRepo } from '../db/repos/session.repo.ts'
import { userRepo } from '../db/repos/user.repo.ts'
import type {
  OtpRepository,
  SessionRepository,
  UserRepository,
} from '../domain/access.ts'
import type { SendMail } from '../lib/mailer/index.ts'
import type { Tx } from '../lib/tx.ts'
import { findUserByEmail } from '../use-cases/access/find-user-by-email.ts'
import { getUserById } from '../use-cases/access/get-user-by-id.ts'
import { requestCode } from '../use-cases/access/request-code.ts'
import { verifyCode, type VerifyCodeDeps } from '../use-cases/access/verify-code.ts'

// The access feature module, written as a CHAIN OF EXPOSES (see
// docs/patterns/feature-modules.md). It REQUIRES its infrastructure via the
// Seed (db + repos + the bound sendMail leaf + generateId); the host
// provides it once. The
// transaction window is a NAMED PRIVATE STEP (`verifyTx`): a fresh tx per
// call, the bridge rebuilds the three repos against the tx handle and
// produces the `Tx<…>` brand (the single cast). The leaf throws infra → the
// tx rolls back; it returns domain → the tx commits.
export const accessModule = lunette<{
  db: Db
  otpRepo: OtpRepository
  userRepo: UserRepository
  sessionRepo: SessionRepository
  sendMail: SendMail
  generateId: () => string
}>()
  // ── the window, private, next to the publics: visibility is a per-step dial
  .provide('verifyTx', (ctx) =>
    window(
      ctx.db.transaction.bind(ctx.db),
      (tx): Tx<VerifyCodeDeps> =>
        ({
          otpRepo: otpRepo({ db: tx }),
          userRepo: userRepo({ db: tx }),
          sessionRepo: sessionRepo({ db: tx }),
          generateId: ctx.generateId,
        }) as Tx<VerifyCodeDeps>,
    ),
  )
  .expose((ctx) => bind({ requestCode })({ otpRepo: ctx.otpRepo, sendMail: ctx.sendMail }))
  .expose((ctx) => bind({ findUserByEmail, getUserById })({ userRepo: ctx.userRepo }))
  .expose((ctx) => bind({ verifyCode }).with(ctx.verifyTx))
  .as('access')
