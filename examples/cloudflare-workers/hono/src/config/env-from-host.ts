import type { Env } from './env.ts'
import { readEnv } from './env.ts'

// The SECOND way the same environment can arrive on this runtime, and the only
// one the Hono pack's `seedFrom(hostEnv)` parameter exists for.
//
// `config/env.ts` reads the bindings from `cloudflare:workers` at MODULE SCOPE.
// Hono can instead hand them over PER REQUEST, as `c.env` — the Workers
// convention before `cloudflare:workers` existed, and still what a Hono app
// running on multiple platforms tends to use.
//
// Both feed the same `readEnv`, so what differs is strictly WHERE the raw
// bindings come from, which is the comparison `test/env-parity.node.test.ts`
// makes: two workers, same chain, same routes, same responses.
//
// One consequence is worth seeing rather than reading: the pack's seed is a
// THUNK evaluated only on the build that happens (§36). So this variant reads
// the `c.env` of the FIRST request and ignores every later one. It is not a
// per-request seed — there is no such thing (a per-call axis is a window,
// principle 4) — and the parameter's name promises more than it delivers.
export const fromHostEnv = (hostEnv: unknown): Env =>
  readEnv((hostEnv ?? {}) as Record<string, unknown>)
