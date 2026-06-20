import { eq, sql } from 'drizzle-orm'
import type { OtpRepository } from '../../domain/access.ts'
import { DbOperationFailed } from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { otps } from '../schema.ts'

// Infra-throws convention: a real DB failure becomes a THROWN DbOperationFailed
// (→ rollback/retry); "no row" is data (null) the leaf reads as a DOMAIN
// outcome. Point-free: destructures the ctx slice it needs, registered with
// `.provide('otpRepo', otpRepo)`. `Queryable` accepts both the root connection
// and a tx handle, so the verifyCode window swaps it untouched.
export const otpRepo = ({ db }: { db: Queryable }): OtpRepository => ({
  async upsert(record) {
    try {
      await db
        .insert(otps)
        .values({ ...record, attempts: 0 })
        .onConflictDoUpdate({
          target: otps.email,
          set: { codeHash: record.codeHash, nonce: record.nonce, expiresAt: record.expiresAt, attempts: 0 },
        })
    } catch (cause) {
      throw new DbOperationFailed({ op: 'otp.upsert', cause })
    }
  },

  async findForUpdate(email) {
    try {
      const [row] = await db
        .select()
        .from(otps)
        .where(eq(otps.email, email))
        .for('update')
        .limit(1)
      return row ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'otp.findForUpdate', cause })
    }
  },

  async incrementAttempts(email) {
    try {
      await db
        .update(otps)
        .set({ attempts: sql`${otps.attempts} + 1` })
        .where(eq(otps.email, email))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'otp.incrementAttempts', cause })
    }
  },

  async consume(email) {
    try {
      await db.delete(otps).where(eq(otps.email, email))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'otp.consume', cause })
    }
  },
})
