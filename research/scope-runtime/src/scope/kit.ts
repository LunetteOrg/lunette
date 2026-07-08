// The host-agnostic scope surface. Everything a host pack re-exports lives
// here: the fragment entry points, the carrier shapes, the fold, the input
// schema projections, and the adapter brand. `scopeFor` is kept as the
// primitive for code that wants the shared `{ guard, handle, input }` surface
// without committing to a host — it is bound to nothing but the HTTP carrier
// default. The host packs re-export the same starting surface.

import { fragment } from './fragment.ts'

export { fragment, fragmentFor } from './fragment.ts'
export type { Fragment, FragmentStart, Handler } from './fragment.ts'
export type {
  CookieOptions,
  CookieSink,
  JobScope,
  Message,
  Outcome,
  RequestScope,
  SetCookie,
} from './scope.ts'
export { runFold, runScope } from './run-fold.ts'
export { validateInput } from './validate.ts'
export { unit } from './schema.ts'
export type { InputOf, OutputOf, UnitSchema } from './schema.ts'
export type { DepGuard } from './adapter-guard.ts'

// The chain is not consumed here (a fragment is bound to no app); the parameter
// keeps the call site self-documenting — `scopeFor(chain)` reads as "the shared
// fragment surface for this app's world". `.input` locks the fragment's input
// schema; `.guard`/`.handle` are usable directly for a param-less fragment.
export function scopeFor(_chain?: unknown) {
  const base = fragment()
  return { guard: base.guard, handle: base.handle, input: base.input }
}
