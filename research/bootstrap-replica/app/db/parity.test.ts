import { sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { connect, type Db } from './client.ts'
import { migrate } from './migrate.ts'
import * as schema from './schema.ts'

// Guards the deliberate shortcut (decision: hand-written DDL, not drizzle-kit):
// after migrate(), every table and column declared in schema.ts must exist in
// the database. Catches drift the moment schema.ts and migrate.ts diverge.
describe('schema ↔ DDL parity', () => {
  let db: Db

  beforeAll(async () => {
    const handle = connect('memory://')
    db = handle.db
    await migrate(db)
  })

  const tables = Object.values(schema).map((table) => getTableConfig(table))

  it.each(tables.map((t) => [t.name, t] as const))(
    'table %s has every declared column',
    async (tableName, table) => {
      const result = await db.execute(
        sql`select column_name from information_schema.columns
            where table_schema = 'public' and table_name = ${tableName}`,
      )
      const actual = new Set(
        (result.rows as { column_name: string }[]).map((r) => r.column_name),
      )
      for (const column of table.columns) {
        expect(actual, `${tableName}.${column.name}`).toContain(column.name)
      }
    },
  )
})
