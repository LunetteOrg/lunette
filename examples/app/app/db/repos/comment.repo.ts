import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { CommentRepository } from '../../domain/threads.ts'
import { DbOperationFailed } from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { comments } from '../schema.ts'

export const commentRepo = ({ db }: { db: Queryable }): CommentRepository => ({
  async create(comment) {
    try {
      await db.insert(comments).values(comment)
      return comment
    } catch (cause) {
      throw new DbOperationFailed({ op: 'comment.create', cause })
    }
  },

  async findById(id) {
    try {
      const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1)
      return row ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'comment.findById', cause })
    }
  },

  async listByPost(postId) {
    try {
      return await db
        .select()
        .from(comments)
        .where(eq(comments.postId, postId))
        .orderBy(asc(comments.createdAt))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'comment.listByPost', cause })
    }
  },

  async countByPosts(postIds) {
    if (postIds.length === 0) return new Map()
    try {
      const rows = await db
        .select({ postId: comments.postId, count: sql<number>`count(*)::int` })
        .from(comments)
        .where(inArray(comments.postId, [...postIds]))
        .groupBy(comments.postId)
      return new Map(rows.map((r) => [r.postId, r.count]))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'comment.countByPosts', cause })
    }
  },

  async update(id, patch) {
    try {
      const [row] = await db.update(comments).set(patch).where(eq(comments.id, id)).returning()
      if (!row) throw new DbOperationFailed({ op: 'comment.update', cause: 'no row' })
      return row
    } catch (cause) {
      if (cause instanceof DbOperationFailed) throw cause
      throw new DbOperationFailed({ op: 'comment.update', cause })
    }
  },

  async remove(id) {
    try {
      await db.delete(comments).where(eq(comments.id, id))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'comment.remove', cause })
    }
  },
})
