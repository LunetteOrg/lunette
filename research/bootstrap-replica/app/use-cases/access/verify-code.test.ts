import { bind, within } from '@lntt/wire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connect, type Db } from '../../db/client.ts'
import { migrate } from '../../db/migrate.ts'
import { otpRepo } from '../../db/repos/otp.repo.ts'
import { userRepo } from '../../db/repos/user.repo.ts'
import type {
  OtpRecord,
  OtpRepository,
  Session,
  SessionRepository,
  User,
  UserRepository,
} from '../../domain/access.ts'
import {
  DbOperationFailed,
  OtpExpired,
  OtpInvalid,
  OtpMaxAttemptsExceeded,
  RegistrationRequired,
} from '../../lib/errors.ts'
import { hashCode } from '../../lib/otp.ts'
import type { Tx } from '../../lib/tx.ts'
import { verifyCode, type VerifyCodeDeps } from './verify-code.ts'

// Bare-leaf testing (decision 13): call the leaf directly with fake deps — no
// chain, no machinery. Stateful fakes are seeded with an OTP record that
// decides each branch. The `as Tx<…>` here stands in for the brand the bridge
// would produce in production.
const future = new Date(Date.now() + 60_000)
const validRecord: OtpRecord = {
  email: 'a@b.c',
  codeHash: hashCode('123456'),
  nonce: 'n',
  attempts: 0,
  expiresAt: future,
}

const makeOtp = (record: OtpRecord | null) => {
  let current = record
  const repo: OtpRepository = {
    async findForUpdate() {
      return current
    },
    async incrementAttempts() {
      if (current) current = { ...current, attempts: current.attempts + 1 }
    },
    async consume() {
      current = null
    },
    async upsert() {},
  }
  return { repo, attempts: () => current?.attempts ?? null, consumed: () => current === null }
}

const makeUsers = (existing: User | null) => {
  let created: User | null = null
  const repo: UserRepository = {
    async findByEmail() {
      return existing
    },
    async findById() {
      return existing
    },
    async findByIds() {
      return existing ? [existing] : []
    },
    async create(reg) {
      created = {
        id: reg.id,
        email: reg.email,
        displayName: reg.displayName ?? null,
        locale: reg.locale ?? null,
        createdAt: new Date(),
      }
      return created
    },
    async update() {
      throw new Error('unused')
    },
  }
  return { repo, created: () => created }
}

const sessionsThatRecord = () => {
  let last: Session | null = null
  const repo: SessionRepository = {
    async create(session) {
      last = session
      return session
    },
    async findById() {
      return last
    },
    async delete() {},
  }
  return { repo, last: () => last }
}

const deps = (over: Partial<VerifyCodeDeps>): Tx<VerifyCodeDeps> =>
  ({
    otpRepo: makeOtp(validRecord).repo,
    userRepo: makeUsers(null).repo,
    sessionRepo: sessionsThatRecord().repo,
    generateId: () => 'generated',
    ...over,
  }) as Tx<VerifyCodeDeps>

describe('verifyCode bare leaf — domain outcomes are RETURNED', () => {
  it('no record → OtpInvalid', async () => {
    expect(await verifyCode(deps({ otpRepo: makeOtp(null).repo }), 'a@b.c', '123456')).toBeInstanceOf(OtpInvalid)
  })

  it('expired → OtpExpired', async () => {
    const otp = makeOtp({ ...validRecord, expiresAt: new Date(Date.now() - 1) })
    expect(await verifyCode(deps({ otpRepo: otp.repo }), 'a@b.c', '123456')).toBeInstanceOf(OtpExpired)
  })

  it('too many attempts → OtpMaxAttemptsExceeded', async () => {
    const otp = makeOtp({ ...validRecord, attempts: 3 })
    expect(await verifyCode(deps({ otpRepo: otp.repo }), 'a@b.c', '123456')).toBeInstanceOf(OtpMaxAttemptsExceeded)
  })

  it('newcomer without accepted terms → RegistrationRequired', async () => {
    expect(await verifyCode(deps({}), 'a@b.c', '123456')).toBeInstanceOf(RegistrationRequired)
  })

  it('wrong code → OtpInvalid AND attempts incremented (the commit path)', async () => {
    const otp = makeOtp(validRecord)
    const result = await verifyCode(deps({ otpRepo: otp.repo }), 'a@b.c', '000000', 'n', { termsAccepted: true })
    expect(result).toBeInstanceOf(OtpInvalid)
    expect(otp.attempts()).toBe(1)
  })

  it('correct code, newcomer with terms → a session, isNewUser true', async () => {
    const users = makeUsers(null)
    const sessions = sessionsThatRecord()
    const otp = makeOtp(validRecord)
    const result = await verifyCode(
      deps({ otpRepo: otp.repo, userRepo: users.repo, sessionRepo: sessions.repo }),
      'a@b.c',
      '123456',
      'n',
      { displayName: 'New', termsAccepted: true },
    )
    expect(result).toMatchObject({ isNewUser: true, userId: 'generated' })
    expect(users.created()?.displayName).toBe('New')
    expect(sessions.last()).not.toBeNull()
    expect(otp.consumed()).toBe(true)
  })
})

// The window guarantee with real Postgres semantics: an infrastructure error
// THROWN inside the transaction rolls the whole thing back — the user created
// moments earlier is gone. This is the throw=infra / rollback half of the
// convention, proven end to end (the commit half is in chain.test.ts).
describe('verifyCode inside a real transaction window — throw rolls back', () => {
  let db: Db
  let close: () => Promise<void>

  beforeEach(async () => {
    const handle = connect('memory://')
    db = handle.db
    close = handle.close
    await migrate(db)
    await otpRepo({ db }).upsert({
      email: 'rollback@b.c',
      codeHash: hashCode('123456'),
      nonce: 'n',
      expiresAt: future,
    })
  })

  afterEach(async () => {
    await close()
  })

  it('a session-create failure rolls back the freshly created user', async () => {
    const throwingSessions: SessionRepository = {
      async create() {
        throw new DbOperationFailed({ op: 'session.create', cause: 'boom' })
      },
      async findById() {
        return null
      },
      async delete() {},
    }

    const window = within(
      db.transaction.bind(db),
      (tx): Tx<VerifyCodeDeps> =>
        ({
          otpRepo: otpRepo({ db: tx }),
          userRepo: userRepo({ db: tx }),
          sessionRepo: throwingSessions,
          generateId: () => 'rolled-back-user',
        }) as Tx<VerifyCodeDeps>,
    )
    const run = bind(window, { verifyCode }).verifyCode

    await expect(
      run('rollback@b.c', '123456', 'n', { termsAccepted: true }),
    ).rejects.toBeInstanceOf(DbOperationFailed)

    // The user insert happened inside the tx — and was rolled back with it.
    expect(await userRepo({ db }).findByEmail('rollback@b.c')).toBeNull()
  })
})
