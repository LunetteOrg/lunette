// The WINDOW (With) and the per-call BINDING (binder.with) — a guided
// progression:
//   step 0: the manual line
//   step 1: the named window + bind(record).with(window)
//   a further step: window(opener, bridge)
//   .by: the window derived from a key argument
//   a facility in the deps: intra-function windows (lock)
//   0/1/N semantics: retry that does not fire on error values

import { describe, expect, it } from 'vitest'
import { bind, lunette, window, type With } from './index.ts'

// ── the brand: "these deps live in a transaction" (a test pattern, not
//    core API) ─────────────────────────────────────────────────────────────
const atomic: unique symbol = Symbol('atomic')
type Tx<D> = D & { readonly [atomic]: true }

// ── fake db: a handle with a mode; transaction lends a 'tx' handle ───────
type DbHandle = {
  mode: 'live' | 'tx'
  query: (sql: string, params?: unknown[]) => Promise<string[]>
}
type Db = DbHandle & {
  txCount: number
  openNow: number
  transaction: <T>(fn: (tx: DbHandle) => Promise<T>) => Promise<T>
}

const createDb = (): Db => {
  const query: DbHandle['query'] = async (_sql, params) =>
    params?.[0] === '0000' ? [] : ['row']
  const db: Db = {
    mode: 'live',
    query,
    txCount: 0,
    openNow: 0,
    transaction: async (fn) => {
      db.txCount += 1
      db.openNow += 1
      try {
        return await fn({ mode: 'tx', query })
      } finally {
        db.openNow -= 1 // the tx ends when the callback returns
      }
    },
  }
  return db
}

// ── the bare leaves ──────────────────────────────────────────────────────
class OtpInvalid extends Error {
  readonly _tag = 'OtpInvalid'
}

// a read: any handle will do
const whereAmI = async ({ db }: { db: DbHandle }) => db.mode

// multiple writes: DEMANDS the transaction in its signature
const verifyOtp = async (
  { db }: { db: Tx<DbHandle> },
  email: string,
  code: string,
) => {
  const consumed = await db.query('consume otp', [code])
  if (consumed.length === 0) return new OtpInvalid()
  await db.query('insert user', [email])
  return { session: email, on: db.mode }
}

describe('step 0 — the manual line', () => {
  it('open the window, build the deps, call', async () => {
    const db = createDb()

    const result = await db.transaction((tx) =>
      verifyOtp({ db: tx as Tx<DbHandle> }, 'a@b.c', '1234'),
    )

    expect(result).toEqual({ session: 'a@b.c', on: 'tx' })
    expect(db.txCount).toBe(1)
  })
})

describe('step 1 — the named window + binder.with', () => {
  it('bind(record).with(window): every call opens its own transaction', async () => {
    const db = createDb()
    const inTx: With<{ db: Tx<DbHandle> }> = (use) =>
      db.transaction((tx) => use({ db: tx as Tx<DbHandle> }))

    const commands = bind({ verifyOtp }).with(inTx)
    const queries = bind({ whereAmI })({ db }) // the applied form: fixed deps

    expect(await queries.whereAmI()).toBe('live')

    expect(await commands.verifyOtp('a@b.c', '1234')).toEqual({
      session: 'a@b.c',
      on: 'tx',
    })
    expect(await commands.verifyOtp('x@y.z', '0000')).toBeInstanceOf(OtpInvalid)
    expect(db.txCount).toBe(2) // two calls = two transactions, in sequence

    expect(await queries.whereAmI()).toBe('live') // the fixed world, intact
  })
})

describe('a further step — window(opener, bridge)', () => {
  it('identical to the hand-written window', async () => {
    const db = createDb()

    const commands = bind({ verifyOtp }).with(
      window(db.transaction, (tx: DbHandle) => ({ db: tx as Tx<DbHandle> })),
      //     └── opener ──┘  └────────── bridge ─────────┘
    )

    expect(await commands.verifyOtp('a@b.c', '1234')).toEqual({
      session: 'a@b.c',
      on: 'tx',
    })
    expect(db.txCount).toBe(1)
  })

  it('the bridge mixes window and boot (the "other" dependencies)', async () => {
    const db = createDb()
    const sent: string[] = []
    const email = { send: async (to: string) => void sent.push(to) }

    const welcome = async (
      { db: handle, email: mailer }: { db: Tx<DbHandle>; email: typeof email },
      to: string,
    ) => {
      await handle.query('insert welcome', [to])
      await mailer.send(to)
      return 'sent'
    }

    const commands = bind({ welcome }).with(
      window(db.transaction, (tx: DbHandle) => ({ db: tx as Tx<DbHandle>, email })),
      //                          from the window ↑    from the boot ↑ (closure)
    )

    expect(await commands.welcome('a@b.c')).toBe('sent')
    expect(sent).toEqual(['a@b.c'])
  })
})

describe('one window, three leaves — the window is PER CALL', () => {
  it('every invocation opens ITS own transaction and closes it on return', async () => {
    const db = createDb()
    const a = async ({ db: h }: { db: Tx<DbHandle> }) => `a:${h.mode}`
    const b = async ({ db: h }: { db: Tx<DbHandle> }) => `b:${h.mode}`
    const c = async ({ db: h }: { db: Tx<DbHandle> }) => `c:${h.mode}`

    const ops = bind({ a, b, c }).with(
      window(db.transaction, (tx: DbHandle) => ({ db: tx as Tx<DbHandle> })),
    )

    expect(db.txCount).toBe(0) // binding opens NOTHING

    expect(await ops.a()).toBe('a:tx')
    expect(db.txCount).toBe(1)
    expect(db.openNow).toBe(0) // a's tx is ALREADY closed: it ends when the leaf returns

    await ops.b()
    await ops.c()
    expect(db.txCount).toBe(3) // three leaves ≠ one shared tx: one per call

    await ops.a()
    expect(db.txCount).toBe(4) // calling the same leaf again opens another one
    expect(db.openNow).toBe(0)
  })
})

describe('one record, HETEROGENEOUS deps — each leaf asks for its subset', () => {
  it('the window serves the intersection; each leaf destructures its part', async () => {
    const db = createDb()
    const sent: string[] = []
    const email = { send: async (to: string) => void sent.push(to) }

    const onlyDb = async ({ db: h }: { db: Tx<DbHandle> }) => h.mode
    const both = async (
      { db: h, email: m }: { db: Tx<DbHandle>; email: typeof email },
      to: string,
    ) => {
      await m.send(to)
      return h.mode
    }

    const ops = bind({ onlyDb, both }).with(
      window(db.transaction, (tx: DbHandle) => ({ db: tx as Tx<DbHandle>, email })),
    )

    expect(await ops.onlyDb()).toBe('tx')
    expect(await ops.both('a@b.c')).toBe('tx')
    expect(sent).toEqual(['a@b.c'])
  })
})

describe('.by — the window derived from a key argument', () => {
  const opened: string[] = []
  const pool = {
    withConnection: async <T>(
      tenant: string,
      fn: (conn: { tenant: string }) => Promise<T>,
    ) => {
      opened.push(tenant)
      return fn({ tenant })
    },
  }

  it('the key selects the window; the leaf never sees it', async () => {
    opened.length = 0

    // pure domain signature: period only. The tenant is WIRING — and when
    // the domain needs it, the bridge hands it in through the DEPS.
    const report = async (
      { conn }: { conn: { tenant: string } },
      period: string,
    ) => `report:${conn.tenant}:${period}`

    const { report: monthly } = bind({ report }).by((tenantId: string) =>
      window(
        (fn) => pool.withConnection(tenantId, fn),
        (conn: { tenant: string }) => ({ conn }),
      ),
    )

    expect(await monthly('acme', '2026-06')).toBe('report:acme:2026-06')
    expect(await monthly('globex', '2026-06')).toBe('report:globex:2026-06')
    expect(opened).toEqual(['acme', 'globex'])
  })

  it('record form: ONE key recipe serves leaves with different args', async () => {
    opened.length = 0

    // this is what taking the key OUT of the leaf signature unlocks: the
    // old args-mirroring form could never type a record.
    const count = async ({ conn }: { conn: { tenant: string } }) =>
      `count:${conn.tenant}`
    const find = async ({ conn }: { conn: { tenant: string } }, id: string) =>
      `find:${conn.tenant}:${id}`

    const queries = bind({ count, find }).by((tenant: string) =>
      window(
        (fn) => pool.withConnection(tenant, fn),
        (conn: { tenant: string }) => ({ conn }),
      ),
    )

    expect(await queries.count('acme')).toBe('count:acme')
    expect(await queries.find('globex', 'x1')).toBe('find:globex:x1')
    expect(opened).toEqual(['acme', 'globex'])
  })
})

describe('intra-function windows — the facility in the deps', () => {
  it('the lock wraps ONLY the critical section, the key comes from the args', async () => {
    const events: string[] = []
    const withLock = async <T>(key: string, go: () => Promise<T>) => {
      events.push(`lock:${key}`)
      try {
        return await go()
      } finally {
        events.push(`unlock:${key}`)
      }
    }

    const transfer = async (
      deps: { withLock: typeof withLock },
      from: string,
      amount: number,
    ) => {
      if (amount <= 0) return new Error('invalid') // outside the lock: as it should be
      return deps.withLock(`account:${from}`, async () => `moved:${amount}`)
    }

    const ops = bind({ transfer })({ withLock })

    expect(await ops.transfer('a', 0)).toBeInstanceOf(Error)
    expect(events).toEqual([]) // validation serializes nothing

    expect(await ops.transfer('a', 10)).toBe('moved:10')
    expect(events).toEqual(['lock:account:a', 'unlock:account:a'])
  })
})

describe('0/1/N semantics — the window may re-execute', () => {
  // retry as a window: re-executes on EXCEPTION, lends the attempt number
  const retry3: With<{ attempt: number }> = async (use) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await use({ attempt })
      } catch (error) {
        if (attempt >= 3) throw error
      }
    }
  }

  it('THROWN errors (infrastructure) trigger the retry', async () => {
    let calls = 0
    const flaky = async ({ attempt }: { attempt: number }) => {
      calls += 1
      if (attempt < 3) throw new Error('network down')
      return 'ok'
    }

    const ops = bind({ flaky }).with(retry3)
    expect(await ops.flaky()).toBe('ok')
    expect(calls).toBe(3)
  })

  it('RETURNED errors (domain) are values: the retry does NOT fire', async () => {
    let calls = 0
    const rejects = async (_deps: { attempt: number }) => {
      calls += 1
      return new OtpInvalid() // a value, not an exception
    }

    const ops = bind({ rejects }).with(retry3)
    expect(await ops.rejects()).toBeInstanceOf(OtpInvalid)
    expect(calls).toBe(1)
  })
})

describe('in the chain — separate provide/expose, no umbrella', () => {
  it('queries and commands as distinct surfaces, db private', async () => {
    await lunette()
      .provide('db', () => createDb())
      .expose('queries', ({ db }) => bind({ whereAmI })({ db }))
      .expose('commands', ({ db }) =>
        bind({ verifyOtp }).with(
          window(db.transaction, (tx: DbHandle) => ({ db: tx as Tx<DbHandle> })),
        ),
      )
      .run(async (pub) => {
        expect(Object.keys(pub)).toEqual(['queries', 'commands'])
        expect(await pub.queries.whereAmI()).toBe('live')
        expect(await pub.commands.verifyOtp('a@b.c', '1234')).toEqual({
          session: 'a@b.c',
          on: 'tx',
        })
      })
  })
})
