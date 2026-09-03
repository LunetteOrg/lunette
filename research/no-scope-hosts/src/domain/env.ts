import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof EnvSchema>

export const parseEnv = (raw: NodeJS.ProcessEnv): Env => EnvSchema.parse(raw)
