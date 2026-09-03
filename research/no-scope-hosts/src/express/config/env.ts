import { parseEnv, type Env } from '../../domain/env.ts'

export type { Env }

export const hostEnv = (): Env => parseEnv(process.env)
