// The public surface of @lntt/example-app: the built chain (and its App type),
// the host env type, and the host-agnostic fragments. The per-host entry
// packages (e.g. examples/rr7) import from here to wire the fragments into a
// concrete host.
export { chain } from './bootstrap/chain.ts'
export type { App } from './bootstrap/chain.ts'
export { parseEnv } from './config/env.ts'
export type { Env } from './config/env.ts'
// The dev outbox — sent mail captured in memory when DEV_MAIL_OUTBOX is set.
// End-to-end tests read it to recover the sign-in code.
export { outbox } from './lib/mailer/outbox.ts'
export type { Mail } from './lib/mailer/index.ts'
export {
  commentFragment,
  commentProcedure,
  commentsFragment,
  feedFragment,
  identityFragment,
  loginFragment,
  logoutFragment,
  postFragment,
  publishPostFragment,
  publishPostProcedure,
  setPreferenceFragment,
  setPreferenceProcedure,
  verifyFragment,
} from './handlers.ts'
