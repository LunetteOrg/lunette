import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import * as schema from './schema.ts'

export type Schema = typeof schema

// The root connection.
export type Db = PgliteDatabase<Schema>

// A transaction handle, as drizzle hands it to `db.transaction((tx) => …)`.
export type Tx = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>

// What every repo accepts: the root connection OR a transaction handle. The
// verifyCode window swaps the handle, nothing else in the repo changes.
export type Queryable = Db | Tx

export type DbHandle = { db: Db; close: () => Promise<void> }

export const connect = (url: string): DbHandle => {
  const client = new PGlite(url === 'memory://' ? undefined : url)
  const db = drizzle(client, { schema })
  return { db, close: async () => { await client.close() } }
}
