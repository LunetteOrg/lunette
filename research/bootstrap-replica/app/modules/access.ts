import { bind, lunette, within } from '@lntt/wire'
import type { Db } from '../db/client.ts'
import { otpRepo } from '../db/repos/otp.repo.ts'
import { sessionRepo } from '../db/repos/session.repo.ts'
import { userRepo } from '../db/repos/user.repo.ts'
import type {
  OtpRepository,
  SessionRepository,
  UserRepository,
} from '../domain/access.ts'
import type { Mailer } from '../lib/mailer/index.ts'
import type { Tx } from '../lib/tx.ts'
import { findUserByEmail } from '../use-cases/access/find-user-by-email.ts'
import { getUserById } from '../use-cases/access/get-user-by-id.ts'
import { requestCode } from '../use-cases/access/request-code.ts'
import { verifyCode, type VerifyCodeDeps } from '../use-cases/access/verify-code.ts'

// The access feature module. It REQUIRES its infrastructure via the Seed
// (db + repos + mailer + generateId); the host provides it once. verifyCode is
// the one transactional leaf: `within(db.transaction, bridge)` opens a fresh tx
// per call, the bridge rebuilds the three repos against the tx handle and
// produces the `Tx<…>` brand (the single cast). The leaf throws infra → the tx
// rolls back; it returns domain → the tx commits.
export const accessModule = lunette<{
  db: Db
  otpRepo: OtpRepository
  userRepo: UserRepository
  sessionRepo: SessionRepository
  mailer: Mailer
  generateId: () => string
}>().expose('access', (ctx) => ({
  ...bind({ otpRepo: ctx.otpRepo, mailer: ctx.mailer }, { requestCode }),
  ...bind({ userRepo: ctx.userRepo }, { findUserByEmail, getUserById }),
  ...bind(
    within(
      ctx.db.transaction.bind(ctx.db),
      (tx): Tx<VerifyCodeDeps> =>
        ({
          otpRepo: otpRepo({ db: tx }),
          userRepo: userRepo({ db: tx }),
          sessionRepo: sessionRepo({ db: tx }),
          generateId: ctx.generateId,
        }) as Tx<VerifyCodeDeps>,
    ),
    { verifyCode },
  ),
}))
