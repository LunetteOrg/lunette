import { and, eq, or } from 'drizzle-orm'
import {
  cacheKeyOf,
  type RenderCacheKey,
  type RenderCacheRepository,
} from '../../domain/render.ts'
import { DbOperationFailed } from '../../lib/errors.ts'
import type { Queryable } from '../client.ts'
import { renderCache } from '../schema.ts'

const matches = (key: RenderCacheKey) =>
  and(
    eq(renderCache.contentType, key.contentType),
    eq(renderCache.contentId, key.contentId),
    eq(renderCache.surface, key.surface),
  )

export const renderCacheRepo = ({ db }: { db: Queryable }): RenderCacheRepository => ({
  async get(key) {
    try {
      const [row] = await db.select().from(renderCache).where(matches(key)).limit(1)
      return row?.output ?? null
    } catch (cause) {
      throw new DbOperationFailed({ op: 'renderCache.get', cause })
    }
  },

  async getMany(keys) {
    if (keys.length === 0) return new Map()
    try {
      const rows = await db
        .select()
        .from(renderCache)
        .where(or(...keys.map(matches)))
      return new Map(
        rows.map((r) => [
          cacheKeyOf({ contentType: r.contentType, contentId: r.contentId, surface: r.surface as RenderCacheKey['surface'] }),
          r.output,
        ]),
      )
    } catch (cause) {
      throw new DbOperationFailed({ op: 'renderCache.getMany', cause })
    }
  },

  async upsert(entry) {
    try {
      await db
        .insert(renderCache)
        .values({ ...entry, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [renderCache.contentType, renderCache.contentId, renderCache.surface],
          set: { output: entry.output, source: entry.source, updatedAt: new Date() },
        })
    } catch (cause) {
      throw new DbOperationFailed({ op: 'renderCache.upsert', cause })
    }
  },
})
