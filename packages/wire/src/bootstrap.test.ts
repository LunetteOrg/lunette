// A realistic app bootstrap in miniature. Covers the points that a real
// bootstrap makes hard:
//
// - db with a lifecycle (instead of memoize + process.once('SIGTERM', close))
//   → here: try/finally around next, teardown in reverse order
// - use cases = functions that require dependencies and return an error or
//   a result (errors-as-values style), exposed per area with `expose`
// - visibility lives in the verb: env/db/repos are `use`/`provide`
//   (private), the auth area is `expose` (public) — consumers receive
//   ONLY auth
// - verifyOtp in a transaction: the repos must be REBUILT against tx.
//   Pattern: the repo factory is shared between the chain and the
//   transaction.

import { describe, expect, it } from 'vitest'
import { lunette } from './index.ts'

// ── fake infrastructure ─────────────────────────────────────────────────

type Env = { DATABASE_URL: string; SENDGRID_API_KEY: string }

type FakeDb = {
  kind: 'db' | 'tx'
  url: string
  closed: boolean
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>) => Promise<T>
}

const createFakeDb = (url: string): FakeDb => {
  const db: FakeDb = {
    kind: 'db',
    url,
    closed: false,
    transaction: async (fn) => fn({ ...db, kind: 'tx' }),
  }
  return db
}

// The shared factory: used both by the repos' provide and inside
// db.transaction. THIS is the pattern that replaces the manual repo
// wiring of a hand-written bootstrap.
const makeRepos = (db: FakeDb) => ({
  otpRepo: { source: db.kind, consume: async (code: string) => code === '1234' },
  userRepo: { source: db.kind, create: async (email: string) => ({ id: 'u1', email }) },
  sessionRepo: { source: db.kind, create: async (userId: string) => ({ id: 's1', userId }) },
})
type Repos = ReturnType<typeof makeRepos>

// ── errors-as-values use cases: deps → input → error | result ──────────

class OtpInvalid extends Error {
  readonly _tag = 'OtpInvalid'
}

const makeVerifyOtp =
  (deps: Pick<Repos, 'otpRepo' | 'userRepo' | 'sessionRepo'>) =>
  async (email: string, code: string) => {
    if (!(await deps.otpRepo.consume(code))) return new OtpInvalid()
    const user = await deps.userRepo.create(email)
    return deps.sessionRepo.create(user.id)
  }

const makeRequestOtp =
  (deps: { otpRepo: Repos['otpRepo']; sendEmail: (to: string) => Promise<void> }) =>
  async (email: string) => {
    await deps.sendEmail(email)
    return 'otp-sent' as const
  }

// ── the public module: a function with requirements, exposed via expose ──

const authModule = (ctx: {
  db: FakeDb
  repos: Repos
  sendEmail: (to: string) => Promise<void>
}) => ({
  auth: {
    requestOtp: makeRequestOtp({ otpRepo: ctx.repos.otpRepo, sendEmail: ctx.sendEmail }),
    // in a transaction: same use cases, repos rebuilt against tx
    // through the shared factory
    verifyOtp: (email: string, code: string) =>
      ctx.db.transaction((tx) => makeVerifyOtp(makeRepos(tx))(email, code)),
  },
})

// ── the chain (the rewritten "createApp") ───────────────────────────────

const teardowns: string[] = []
const sentEmails: string[] = []
// the infrastructure is private: for the assertions we capture it from
// the layer itself, not from the app (where it does not exist)
let dbRef: FakeDb | undefined

const app = () => {
  teardowns.length = 0
  dbRef = undefined
  return lunette()
    .provide(() => ({ env: { DATABASE_URL: 'pg://test', SENDGRID_API_KEY: 'sk' } as Env }))
    .use(async (ctx, next) => {
      const db = createFakeDb(ctx.env.DATABASE_URL)
      dbRef = db
      try {
        return await next({ db })
      } finally {
        db.closed = true
        teardowns.push('db')
      }
    })
    .use(async (_ctx, next) => {
      try {
        return await next({
          sendEmail: async (to: string) => {
            sentEmails.push(to)
          },
        })
      } finally {
        teardowns.push('email')
      }
    })
    .provide((ctx) => ({ repos: makeRepos(ctx.db) }))
    .expose(authModule)
}

// ── tests ───────────────────────────────────────────────────────────────

describe('app bootstrap in miniature', () => {
  it('the public app contains ONLY the exposed area', async () => {
    await app().run(async (pub) => {
      expect(Object.keys(pub)).toEqual(['auth'])
      expect('db' in pub).toBe(false)
      expect('repos' in pub).toBe(false)
    })
  })

  it('exposes the use cases per area and executes them', async () => {
    await app().run(async ({ auth }) => {
      expect(await auth.requestOtp('a@b.c')).toBe('otp-sent')

      const session = await auth.verifyOtp('a@b.c', '1234')
      expect(session).toEqual({ id: 's1', userId: 'u1' })

      const failure = await auth.verifyOtp('a@b.c', '0000')
      expect(failure).toBeInstanceOf(OtpInvalid)
    })
  })

  it('inside the transaction the repos are rebuilt against tx', async () => {
    const db = createFakeDb('pg://probe')
    expect(makeRepos(db).otpRepo.source).toBe('db')

    await db.transaction(async (tx) => {
      expect(makeRepos(tx).otpRepo.source).toBe('tx')
    })
  })

  it('teardown runs in reverse construction order', async () => {
    await app().run(async () => {
      expect(dbRef?.closed).toBe(false)
    })

    expect(dbRef?.closed).toBe(true)
    expect(teardowns).toEqual(['email', 'db'])
  })

  it('teardown runs even if the scope throws', async () => {
    await expect(
      app().run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(dbRef?.closed).toBe(true)
  })

  it('build() delivers app and dispose for hosts that cannot live in a callback', async () => {
    const { app: built, dispose } = await app().build()

    expect(await built.auth.requestOtp('x@y.z')).toBe('otp-sent')
    expect(dbRef?.closed).toBe(false)

    await dispose()
    expect(dbRef?.closed).toBe(true)
  })
})
