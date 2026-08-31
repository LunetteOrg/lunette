import { layer } from '@lntt/wire'
import type { Env } from '../config/env.ts'
import { connect, type Db } from './client.ts'
import { migrate } from './migrate.ts'

// The ONE place the explicit onion earns its keep: a resource with teardown.
// `provide(fn, destroy)` can't separate the exposed value (`db`) from a
// distinct teardown target (`close`), so the raw bracket is the honest tool.
// Opens the pool, ensures the schema, lends `db` for the whole app lifetime,
// closes on the way out.
export const withDb = layer<{ env: Env }, { db: Db }>(async ({ env }, next) => {
  const { db, close } = connect(env.DATABASE_URL)
  await migrate(db)
  try {
    return await next({ db })
  } finally {
    await close()
  }
})
