// The host-agnostic scope surface. Everything a host pack re-exports lives
// here: the fragment entry points, the carrier shapes, the fold, and the
// adapter brand. `scopeFor` is kept as the primitive for code that wants the
// shared `{ guard, handle }` surface without committing to a host — it is bound
// to nothing but the HTTP carrier default. The host packs
// (reactRouter/hono/express) re-export the same `guard`/`handle`.

import { fragment } from './fragment.ts'

export { fragment, fragmentFor } from './fragment.ts'
export type { Fragment, Handler } from './fragment.ts'
export type {
  CookieOptions,
  CookieSink,
  JobScope,
  Message,
  Outcome,
  RequestScope,
  SetCookie,
} from './scope.ts'
export { runFold } from './run-fold.ts'
export type { DepGuard } from './adapter-guard.ts'

// The chain is not consumed here (a fragment is bound to no app); the parameter
// keeps the call site self-documenting — `scopeFor(chain)` reads as "the shared
// fragment surface for this app's world".
export function scopeFor(_chain?: unknown) {
  const base = fragment()
  return { guard: base.guard, handle: base.handle }
}
