import { describe, expect, it } from 'vitest'
import { build, layer } from './layers.ts'

type Env = { DATABASE_URL: string; SENDGRID_API_KEY: string }
type Db = { query: (sql: string) => Promise<string[]> }
type EmailService = {
  send: (to: string, body: string) => Promise<void>
  sent: Array<{ to: string; body: string }>
}

const parseEnv = (): Env => ({
  DATABASE_URL: 'postgres://localhost:5432/dev',
  SENDGRID_API_KEY: 'sk-test',
})

const createDb = (url: string): Db => ({
  query: async (sql) => [`${url} :: ${sql}`],
})

const createEmailService = (_apiKey: string): EmailService => {
  const sent: EmailService['sent'] = []
  return {
    sent,
    send: async (to, body) => {
      sent.push({ to, body })
    },
  }
}

const makeRequestOtp =
  (deps: { db: Db; email: EmailService }) =>
  async ({ email }: { email: string }) => {
    const [row] = await deps.db.query(`insert otp for ${email}`)
    await deps.email.send(email, `your otp (${row})`)
    return 'otp-sent'
  }

const envLayer = layer({
  requires: [],
  provides: () => ({ env: parseEnv() }),
})

const dbLayer = layer({
  requires: ['env'],
  provides: (ctx: { env: Env }) => ({ db: createDb(ctx.env.DATABASE_URL) }),
})

const emailLayer = layer({
  requires: ['env'],
  provides: (ctx: { env: Env }) => ({
    email: createEmailService(ctx.env.SENDGRID_API_KEY),
  }),
})

const authLayer = layer({
  requires: ['db', 'email'],
  provides: (ctx: { db: Db; email: EmailService }) => ({
    useCases: { requestOtp: makeRequestOtp(ctx) },
  }),
})

describe('order-free layers', () => {
  it('builds the context by resolving dependencies', async () => {
    const app = await build(envLayer, dbLayer, emailLayer, authLayer)

    const result = await app.useCases.requestOtp({ email: 'a@b.c' })

    expect(result).toBe('otp-sent')
    expect(app.email.sent).toHaveLength(1)
  })

  it('the argument order is free', async () => {
    const app = await build(authLayer, emailLayer, dbLayer, envLayer)

    expect(await app.useCases.requestOtp({ email: 'x@y.z' })).toBe('otp-sent')
  })

  it('reports unresolvable dependencies at runtime', async () => {
    const orphan = layer({
      requires: ['ghost'],
      provides: (_ctx: { ghost: string }) => ({ never: true }),
    })

    // the cast simulates a caller that ignored the type error
    await expect(build(orphan as never)).rejects.toThrow(
      /Unresolvable or cyclic dependencies/,
    )
  })
})
