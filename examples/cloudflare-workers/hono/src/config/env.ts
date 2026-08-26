import { env } from 'cloudflare:workers'

// The ONE host-specific file, and on Workers it is the whole point of the
// arrangement: the Node entries read `process.env` here, this one reads the
// Workers binding namespace, and NOTHING downstream changes — the chain, the
// scopes and the mount take `Env` as a value and never ask where it was read.
//
// `import { env } from 'cloudflare:workers'` is available at MODULE SCOPE, and
// that is the claim the Node entries could only write in a comment: reading
// vars, secrets and binding OBJECTS while this module is evaluated is allowed.
// What is not allowed is USING a binding here — a KV read outside a request is
// asynchronous I/O, which the runtime refuses. Hence the split this file makes
// visible: the environment is read eagerly, the app is built lazily (§36), and
// `test/module-scope.node.test.ts` holds the runtime to it.
export interface Env {
  readonly LABEL: string
  readonly SIGNING_SECRET: string
  // A binding is environment too — it just arrives as an object rather than a
  // string. On Node the equivalent is a DATABASE_URL that a layer opens; here
  // the platform hands the handle over and the layer uses it.
  readonly LINKS: KVNamespace
}

// A bad config is infrastructure → throw and fail loud (§17). On Workers this
// runs on the first request rather than at boot, so the message has to name the
// key: there is no startup log to read it from.
const requiredString = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key]
  if (typeof value !== 'string' || value === '')
    throw new Error(`Invalid environment: ${key} is required`)
  return value
}

const requiredBinding = <T>(raw: Record<string, unknown>, key: string): T => {
  const value = raw[key]
  if (value == null || typeof value !== 'object')
    throw new Error(`Invalid environment: the ${key} binding is missing`)
  return value as T
}

// The parse, separated from the SOURCE so the two can vary independently: this
// entry has a second source (`config/env-from-host.ts`, Hono's per-request
// `c.env`) and both must land on the same `Env`.
export const readEnv = (raw: Record<string, unknown>): Env => ({
  LABEL: requiredString(raw, 'LABEL'),
  SIGNING_SECRET: requiredString(raw, 'SIGNING_SECRET'),
  LINKS: requiredBinding<KVNamespace>(raw, 'LINKS'),
})

export const hostEnv = (): Env => readEnv(env as unknown as Record<string, unknown>)
