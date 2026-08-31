import { hono } from '@lntt/integration/hono'
import { chain } from '../chain.ts'
import { fromHostEnv } from '../config/env-from-host.ts'

// The SAME composition root as `./index.ts` with one line different: the seed is
// built from the host env Hono passes (`c.env`) instead of from the module-scope
// import. It is the only place an APP in this repo reads `seedFrom`'s parameter
// — the React Router pack carries the same parameter for `args.context`, and
// `packages/integration/test/hono.test.ts` is where the delivery itself is
// asserted.
//
// `seedFrom` is typed `(hostEnv: unknown) => Seed` — the pack has no way to know
// what a given host's env is. No cast is needed even so: `readEnv` takes
// `unknown`, which is what `safeParse` wants anyway.
const pack = hono(chain, (hostEnv) => ({ env: fromHostEnv(hostEnv) }))

export const { handler, mount, dispose } = pack
