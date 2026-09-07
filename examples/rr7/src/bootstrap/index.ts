import { chain } from '@lntt/example-app'
import { hostEnv } from '../config/env.ts'

// The composition root: the chain, built ONCE at module scope. An ES module
// is already a singleton, so there is no memo to keep — `await` here runs at
// import, and every importer gets the same app.
//
// This is the shape to prefer on Node. It does NOT transfer to Cloudflare
// Workers: there the bindings only exist inside a request, and I/O at module
// scope is forbidden — a chain that opens something would fail at import.
// `buildOnce` in @lntt/wire is for that (§36), and it is the only reason a
// Workers entry builds lazily instead of at import.
void hostEnv()

export const { app: deps, dispose } = await chain.build()
