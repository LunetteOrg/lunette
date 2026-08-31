import { chain } from '@lntt/example-app'
import { express } from '@lntt/integration/express'
import { hostEnv } from '../config/env.ts'

// The app's composition root, and the ONLY module that knows about @lntt. It
// builds the pack once at module scope — an ES module IS a singleton, so this
// runs once per server process — and re-exports what the mount uses. `server.ts`
// takes `handler` from here and never sees the chain, the pack, or the env.
//
// The build itself stays LAZY: the seed is a thunk `ensure` evaluates on the
// build that actually happens (§36), so `hostEnv()` is read on the first request
// rather than while this module is being evaluated. Express has no per-request
// host env, so `seedFrom` takes no argument here — it is the same shape either
// way, the source of the values being the config module's business.
const pack = express(chain, () => ({ env: hostEnv() }))

export const { handler, mount, dispose } = pack
