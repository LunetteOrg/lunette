import { z } from 'zod'

// Treats an empty string as absent, then optional: shell exports of `FOO=`
// must not count as "the flag is present".
const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // PGlite: a filesystem path, or 'memory://' for an ephemeral in-process db.
    DATABASE_URL: z.string().default('memory://'),
    SESSION_SECRET: z
      .string()
      .min(32)
      .default('insecure-dev-session-secret-change-me!!'),

    // Feature flag — mailer: the real transactional sender when the key is
    // present; otherwise a logging sink (the demo path).
    MAILER_API_KEY: optional(z.string()),
    DEV_MAIL_OUTBOX: optional(z.string()),

    // Feature flag — renderer: the real rendering provider when its project id
    // is present; otherwise the deterministic fake.
    RENDERER_PROJECT_ID: optional(z.string()),

    // Feature flag — blobs: the real object store ONLY when ALL FIVE are
    // present (logical AND); otherwise the in-memory fake.
    BLOB_ENDPOINT: optional(z.string()),
    BLOB_REGION: optional(z.string()),
    BLOB_BUCKET: optional(z.string()),
    BLOB_ACCESS_KEY: optional(z.string()),
    BLOB_SECRET_KEY: optional(z.string()),
  })
  // Production refuses the fakes and fails fast at boot — the guards live here,
  // in the parse, so the selectors downstream can trust their input.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    const require = (key: string, present: unknown, message: string) => {
      if (!present)
        ctx.addIssue({ code: 'custom', path: [key], message })
    }
    require('MAILER_API_KEY', env.MAILER_API_KEY, 'required in production (no logger fallback: codes would leak to logs)')
    require('RENDERER_PROJECT_ID', env.RENDERER_PROJECT_ID, 'required in production (the fake serves placeholder output)')
    if (env.DEV_MAIL_OUTBOX)
      ctx.addIssue({ code: 'custom', path: ['DEV_MAIL_OUTBOX'], message: 'forbidden in production' })
    const blobs = [
      env.BLOB_ENDPOINT,
      env.BLOB_REGION,
      env.BLOB_BUCKET,
      env.BLOB_ACCESS_KEY,
      env.BLOB_SECRET_KEY,
    ]
    if (!blobs.every(Boolean))
      ctx.addIssue({ code: 'custom', path: ['BLOB_ENDPOINT'], message: 'all BLOB_* are required in production (the fake serves unusable memory:// urls)' })
  })

export type Env = z.infer<typeof EnvSchema>

// A bad config at boot is infrastructure → throw and fail loud (decision 17,
// story 17). The aggregated message names every offending key at once.
export const parseEnv = (raw: NodeJS.ProcessEnv): Env => {
  const result = EnvSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}
