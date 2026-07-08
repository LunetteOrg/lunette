// The public surface of @lntt/example-app: the built chain (and its App type),
// the host env type, and the host-agnostic fragments. The per-host entry
// packages (e.g. examples/rr7) import from here to wire the fragments into a
// concrete host.
export { chain } from './bootstrap/chain.ts'
export type { App } from './bootstrap/chain.ts'
export { parseEnv } from './config/env.ts'
export type { Env } from './config/env.ts'
export { feedFragment, loginFragment, postFragment } from './handlers.ts'
