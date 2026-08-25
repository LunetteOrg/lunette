import { chain } from '@lntt/example-app'
import { hono } from '@lntt/integration/hono'
import { hostEnv } from '../config/env.ts'

// The app's composition root, and the ONLY module that knows about @lntt. It
// builds the pack once at module scope — an ES module IS a singleton, so this
// runs once per server process — and re-exports what the mount uses. `server.ts`
// takes `handler` from here and never sees the chain, the pack, or the env.
//
// The build itself stays LAZY: the seed is a thunk `ensure` evaluates on the
// build that actually happens (§36), so `hostEnv()` is read on the first request
// rather than while this module is being evaluated.
//
// `seedFrom` receives the HOST env — on Hono that is `c.env`, which is where
// Cloudflare hands bindings. This entry is Node, so there is nothing there and
// the argument is ignored; the Workers entry is where that parameter carries
// something.
const pack = hono(chain, () => ({ env: hostEnv() }))

export const { handler, mount, dispose } = pack
