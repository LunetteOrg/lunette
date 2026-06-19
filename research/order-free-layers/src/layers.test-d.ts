import { describe, expectTypeOf, it } from 'vitest'
import { build, layer } from './layers.ts'

type Env = { DATABASE_URL: string; SENDGRID_API_KEY: string }
type Db = { query: (sql: string) => Promise<string[]> }
type EmailService = {
  send: (to: string, body: string) => Promise<void>
  sent: Array<{ to: string; body: string }>
}

declare const env: Env
declare const db: Db
declare const email: EmailService

const envLayer = layer({
  requires: [],
  provides: () => ({ env }),
})

const dbLayer = layer({
  requires: ['env'],
  provides: (_ctx: { env: Env }) => ({ db }),
})

const emailLayer = layer({
  requires: ['env'],
  provides: (_ctx: { env: Env }) => ({ email }),
})

describe('order-free layers (types)', () => {
  it('the built context is the merge of all provides', async () => {
    const app = await build(envLayer, dbLayer, emailLayer)

    expectTypeOf(app).toEqualTypeOf<{
      env: Env
      db: Db
      email: EmailService
    }>()
  })

  it('order does not matter for the types', async () => {
    const app = await build(dbLayer, envLayer)

    expectTypeOf(app.db).toEqualTypeOf<Db>()
  })

  it('rejects a layer set with uncovered requirements', () => {
    // @ts-expect-error — dbLayer requires env and no layer provides it
    build(dbLayer)

    // @ts-expect-error — env is still missing even with more layers
    build(dbLayer, emailLayer)
  })
})
