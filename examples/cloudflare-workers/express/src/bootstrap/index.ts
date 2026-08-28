import { express } from '@lntt/integration/express'
import { chain } from '../chain.ts'
import { hostEnv } from '../config/env.ts'

// The app's composition root — and the point of this package is how ordinary it
// is. `@lntt/integration/express` was written for Node: it lifts an
// `IncomingMessage` into a Web `Request` (`toWebRequest`), writes the outcome
// onto a `ServerResponse` (`renderOutcome`), and brands the mount with
// `DepGuard`/`CarrierGuard`. None of that knows what a Worker is, and none of it
// changes here.
//
// Its `seedFrom` takes NO host env — Express has no per-request platform
// channel, which on Node reads as a small asymmetry with the Hono pack and here
// turns out to be the whole story: the bindings can only come from
// `cloudflare:workers`, through `config/env.ts`. The parameter Hono's pack
// carries for `c.env` would have nowhere to attach.
//
// The build stays lazy for the reason it must (§36): the store layer reads KV,
// and no I/O is allowed outside a request.
const pack = express(chain, () => ({ env: hostEnv() }))

export const { handler, mount, dispose } = pack
