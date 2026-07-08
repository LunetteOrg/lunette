import { eq, inArray } from 'drizzle-orm'
import type { UserRepository } from '../../domain/access.ts'
import {
  DbOperationFailed,
  InfrastructureError,
  UserCreateNoRows,
} from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { users } from '../schema.ts'

export const userRepo = ({ db }: { db: Queryable }): UserRepository => ({
  async findByEmail(email) {
    try {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      return row ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'user.findByEmail', cause })
    }
  },

  async findById(id) {
    try {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
      return row ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'user.findById', cause })
    }
  },

  async findByIds(ids) {
    if (ids.length === 0) return []
    try {
      return await db.select().from(users).where(inArray(users.id, [...ids]))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'user.findByIds', cause })
    }
  },

  async create(registration) {
    try {
      const [row] = await db
        .insert(users)
        .values({
          id: registration.id,
          email: registration.email,
          displayName: registration.displayName ?? null,
          locale: registration.locale ?? null,
        })
        .returning()
      if (!row) throw new UserCreateNoRows()
      return row
    } catch (cause) {
      if (cause instanceof InfrastructureError) throw cause
      throw new DbOperationFailed({ op: 'user.create', cause })
    }
  },

  async update(id, patch) {
    try {
      const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
      if (!row) throw new UserCreateNoRows()
      return row
    } catch (cause) {
      if (cause instanceof InfrastructureError) throw cause
      throw new DbOperationFailed({ op: 'user.update', cause })
    }
  },
})
