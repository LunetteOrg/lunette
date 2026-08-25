// The ONE host-specific file: where the environment comes from. Everything
// downstream takes `Env` as a value and never asks where it was read, which is
// what keeps the rest of the app portable.
import { parseEnv, type Env } from '@lntt/example-app'

export type { Env }

export const hostEnv = (): Env => parseEnv(process.env)

// On Cloudflare Workers the same file reads the bindings instead — variables and
// secrets ARE available at module scope, so the shape does not change:
//
//   import { env } from 'cloudflare:workers'
//   import { parseEnv, type Env } from '@lntt/example-app'
//
//   export const hostEnv = (): Env => parseEnv(env)
//
// The one rule that survives the swap: no I/O outside a request. Reading values
// here is fine; calling a KV namespace, a Durable Object stub or a service
// binding at module scope is not, so anything that OPENS something must stay
// behind the lazy build (see @lntt/wire's `buildOnce`, §36) rather than run
// while this module is being evaluated.
