import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type Db } from './client.ts'
import { migrate } from './migrate.ts'
import { otps, users } from './schema.ts'

// De-risks the whole foundation before any leaf is built: PGlite boots, the
// schema applies, CRUD round-trips, and — the guarantee the verifyCode window
// rests on — a transaction rolls back when its callback throws.
describe('db foundation (PGlite + Drizzle)', () => {
  let db: Db
  let close: () => Promise<void>

  beforeAll(async () => {
    const handle = connect('memory://')
    db = handle.db
    close = handle.close
    await migrate(db)
  })

  afterAll(async () => {
    await close()
  })

  it('round-trips a row', async () => {
    await db.insert(users).values({ id: 'u1', email: 'a@b.c' })
    const [row] = await db.select().from(users).where(eq(users.id, 'u1'))
    expect(row?.email).toBe('a@b.c')
  })

  it('rolls back a transaction when the callback throws (the window guarantee)', async () => {
    await db.insert(otps).values({
      email: 'x@y.z',
      codeHash: 'h',
      nonce: 'n',
      expiresAt: new Date(Date.now() + 60_000),
    })

    await expect(
      db.transaction(async (tx) => {
        await tx.update(otps).set({ attempts: 1 }).where(eq(otps.email, 'x@y.z'))
        throw new Error('infra failure → rollback')
      }),
    ).rejects.toThrow('rollback')

    const [row] = await db.select().from(otps).where(eq(otps.email, 'x@y.z'))
    expect(row?.attempts).toBe(0) // the increment was rolled back
  })

  it('commits a transaction that returns normally', async () => {
    await db.transaction(async (tx) => {
      await tx
        .update(otps)
        .set({ attempts: 2 })
        .where(eq(otps.email, 'x@y.z'))
    })

    const [row] = await db.select().from(otps).where(eq(otps.email, 'x@y.z'))
    expect(row?.attempts).toBe(2)
  })
})
