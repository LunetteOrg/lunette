import { desc, eq } from 'drizzle-orm'
import type { Post, PostRepository, PostStatus } from '../../domain/threads.ts'
import { DbOperationFailed } from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { posts } from '../schema.ts'

const toPost = (row: typeof posts.$inferSelect): Post => ({
  ...row,
  status: row.status as PostStatus,
})

export const postRepo = ({ db }: { db: Queryable }): PostRepository => ({
  async create(post) {
    try {
      await db.insert(posts).values(post)
      return post
    } catch (cause) {
      throw new DbOperationFailed({ op: 'post.create', cause })
    }
  },

  async findById(id) {
    try {
      const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
      return row ? toPost(row) : null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'post.findById', cause })
    }
  },

  async listPublished() {
    try {
      const rows = await db
        .select()
        .from(posts)
        .where(eq(posts.status, 'published'))
        .orderBy(desc(posts.createdAt))
      return rows.map(toPost)
    } catch (cause) {
      throw new DbOperationFailed({ op: 'post.listPublished', cause })
    }
  },

  async update(id, patch) {
    try {
      const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning()
      if (!row) throw new DbOperationFailed({ op: 'post.update', cause: 'no row' })
      return toPost(row)
    } catch (cause) {
      if (cause instanceof DbOperationFailed) throw cause
      throw new DbOperationFailed({ op: 'post.update', cause })
    }
  },

  async remove(id) {
    try {
      await db.delete(posts).where(eq(posts.id, id))
    } catch (cause) {
      throw new DbOperationFailed({ op: 'post.remove', cause })
    }
  },
})
