import { hono } from '@lntt/integration/hono'
import { chain } from '../chain.ts'
import { fromHostEnv } from '../config/env-from-host.ts'

// The SAME composition root as `./index.ts` with one line different: the seed is
// built from the host env Hono passes (`c.env`) instead of from the module-scope
// import. This is the only place in the repo that uses `seedFrom`'s parameter,
// which is why it exists — the signature was carried for `c.env` and nothing
// exercised it.
//
// `seedFrom` is typed `(hostEnv: unknown) => Seed`, so the cast lives in
// `fromHostEnv`. That the parameter cannot be typed by the pack — it has no way
// to know what a given host's env is — is itself an argument in the open
// question about whether it earns its place.
const pack = hono(chain, (hostEnv) => ({ env: fromHostEnv(hostEnv) }))

export const { handler, mount, dispose } = pack
