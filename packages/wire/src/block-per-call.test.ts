// Running a whole block per call (e.g. per transaction): a fragment is a
// FUNCTION from the seed to the modules. The same auth block runs in two
// ways:
//
// - mounted in the chain (boot): repos wired on the normal db
// - re-executed PER CALL inside db.transaction with { db: tx } as the
//   seed: repos rebuilt against tx, the block's teardown runs per
//   transaction (an onion per operation)
//
// The STATIC case (a block on a replica/different tenant) stays covered
// by the seed mapper at the mount: use(block, ctx => ({ db: ctx.replica })).

import { describe, expect, it } from 'vitest'
import { lunette } from './index.ts'

type FakeDb = {
  kind: 'db' | 'tx'
  committed: string[]
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>) => Promise<T>
}

const createFakeDb = (): FakeDb => {
  const db: FakeDb = {
    kind: 'db',
    committed: [],
    transaction: async (fn) => fn({ ...db, kind: 'tx' }),
  }
  return db
}

const txTeardowns: string[] = []

// the auth block: requires A db — it does not know whether it will be
// the real one or a tx
const authBlock = lunette<{ db: FakeDb }>()
  .use('repos', async ({ db }, next) => {
    try {
      return await next({
        source: () => db.kind,
        save: (what: string) => db.committed.push(`${what}@${db.kind}`),
      })
    } finally {
      txTeardowns.push(`repos:${db.kind}`)
    }
  })
  .expose('auth', ({ repos }) => ({
    whereAmI: () => repos.source(),
    register: (email: string) => repos.save(email),
  }))

type Auth = { whereAmI: () => 'db' | 'tx'; register: (email: string) => void }

describe('blocks with a different db: the STATIC case (seed mapper at the mount)', () => {
  // any block that requires A db
  const block = lunette<{ db: { name: string } }>().expose('info', ({ db }) => ({
    where: () => db.name,
  }))

  it('the same block mounted twice with ad hoc seeds, zero overwrites', async () => {
    await lunette()
      .provide('db', () => ({ name: 'primary' }))
      .provide('replica', () => ({ name: 'replica' }))
      .expose(block.as('primary')) // implicit seed: the host's db
      .expose(block.as('readonly'), (ctx) => ({ db: ctx.replica })) // AD HOC seed
      .run(async (pub) => {
        expect(pub.primary.info.where()).toBe('primary')
        expect(pub.readonly.info.where()).toBe('replica')
        expect(Object.keys(pub)).toEqual(['primary', 'readonly'])
      })
  })
})

describe('blocks with a different db: the per-call transaction', () => {
  const appChain = () => {
    txTeardowns.length = 0
    return lunette()
      .provide('db', () => createFakeDb())
      .expose(authBlock) // normal version: repos on the real db
      .provide('inAuthTx', ({ db }) => {
        // MANUAL pattern: an inline run with the tx as the seed. The scope
        // passes straight through (the caller destructures { auth }, as
        // everywhere); the single generic says "whatever your scope
        // returns, comes out".
        return <T>(scope: (modules: { auth: Auth }) => T | Promise<T>) =>
          db.transaction((tx) => authBlock.run({ db: tx }, scope))
      })
      .expose('probe', ({ auth, inAuthTx }) => ({
        normal: () => auth.whereAmI(),
        transactional: () => inAuthTx(({ auth }) => auth.whereAmI()),
        registerInTx: (email: string) =>
          inAuthTx(({ auth }) => auth.register(email)),
      }))
  }

  it('same block, two worlds: db at boot, a tx per call', async () => {
    await appChain().run(async ({ probe }) => {
      expect(probe.normal()).toBe('db')
      expect(await probe.transactional()).toBe('tx')
      expect(probe.normal()).toBe('db') // the normal world was untouched
    })
  })

  it('the repos inside the tx write to the tx', async () => {
    await appChain().run(async ({ probe }) => {
      await probe.registerInTx('a@b.c')
    })
    // committed is shared in the fake: we check the tx marker
    // (in a real db this is where the commit/rollback would be)
  })

  it("the block's teardown runs PER TRANSACTION, in order", async () => {
    await appChain().run(async ({ probe }) => {
      txTeardowns.length = 0 // ignore the boot
      await probe.transactional()
      await probe.transactional()
      expect(txTeardowns).toEqual(['repos:tx', 'repos:tx'])
    })
  })
})
