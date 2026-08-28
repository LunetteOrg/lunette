import { buildOnce } from '@lntt/wire'
import { chain } from '@lntt/example-app'
import type { App } from '@lntt/example-app'
import { hostEnv } from '../config/env.ts'

// The app's composition root, and the ONLY module that knows about @lntt's
// lifecycle. It holds the build-once handle at module scope — an ES module IS a
// singleton, so this runs once per process — and hands the router a context.
//
// tRPC is the host where this file differs most, and the difference is real
// rather than stylistic: @lntt/integration/trpc ships NO pack. tRPC already owns
// a context, and the app travels in it, so `buildOnce` (§36) is called here
// directly instead of by an adapter. `toProcedure` then reads the app off
// `ctx` — the guest posture with the host's own channel (§33).
const { ensure, dispose } = buildOnce(chain)

export { dispose }

// The tRPC context: the built app singletons plus the carrier the scopes read (a
// `request` — natural for tRPC-over-HTTP). A RequestCarrier scope consumed by
// tRPC needs its carrier fields present on the context.
export type Ctx = App & { request: Request }

// The build stays LAZY: the seed is a thunk `ensure` evaluates on the build that
// actually happens, so `hostEnv()` is read on the first request rather than
// while this module is being evaluated.
export const createContext = async (request: Request): Promise<Ctx> => ({
  ...(await ensure(() => ({ env: hostEnv() }))).app,
  request,
})
