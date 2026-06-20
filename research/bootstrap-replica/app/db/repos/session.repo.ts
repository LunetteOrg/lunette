import { eq } from 'drizzle-orm'
import type { SessionRepository } from '../../domain/access.ts'
import { DbOperationFailed } from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { sessions } from '../schema.ts'

export const sessionRepo = ({ db }: { db: Queryable }): SessionRepository => ({
  async create(session) {
    try {
      await db.insert(sessions).values(session)
      return session
    } catch (cause) {
      throw new DbOperationFailed({ op: 'session.create', cause })
    }
  },

  async findById(id) {
    try {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
      return row ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'session.findById', cause })
    }
  },

  async delete(id) {
    try {
      await db.delete(sessions).where(eq(sessions.id, id))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'session.delete', cause })
    }
  },
})
