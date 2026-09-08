import { z } from 'zod'

// The ONE host-specific file in this layout — where the environment comes
// from. Node reads `process.env`; a Cloudflare Workers entry reads `env` off
// the fetch handler instead, and nothing downstream of `hostEnv()` changes.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export const hostEnv = (): Env => EnvSchema.parse(process.env)
