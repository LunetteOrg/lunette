import { chain } from '@lntt/example-app'
import { reactRouter } from '@lntt/integration/react-router'
import { hostEnv } from '../config/env.ts'

// The app's composition root, and the ONLY module that knows about @lntt.
// It builds the pack once at module scope — an ES module IS a singleton, so
// this runs once per server process — and re-exports the two helpers the route
// modules use. Routes import `toLoader`/`toAction` from here and never see the
// chain, the pack, or the env.
//
// The build itself stays LAZY (first request that reaches a loader). On Node an
// eager `await chain.build(...)` here would work just as well; on Cloudflare a
// layer that touches a binding while constructing stops the worker from
// STARTING, since no asynchronous I/O is allowed outside a request. Lazy is the
// shape that is correct in both, which is why the pack owns it — and
// `examples/cloudflare-workers/*` runs the negative case rather than asserting
// it here (§36).
const pack = reactRouter(chain, () => ({ env: hostEnv() }))

export const { toLoader, toAction, dispose } = pack
