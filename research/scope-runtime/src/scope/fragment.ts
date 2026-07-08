import type { Abort } from './abort.ts'
import type { RequestScope } from './scope.ts'

// The abstract fragment: a guard/leaf stack captured as data, bound to NO app.
// Two phantom markers carry the fragment's two independent axes — its app
// REQUIREMENT `Need` and its route PARAMS `P` — into the type structure so the
// adapter can check them at compile time. The markers are LOAD-BEARING: drop
// them and two Handlers become structurally identical, the adapter infers
// `unknown`, and the check silently disables (spike 1, caveat 2).
export interface Handler<Need extends object, P extends object, R> {
  readonly __need?: (n: Need) => void
  readonly __params?: (p: P) => void
  readonly __result?: R
  // Erased fold ingredients — the fragment defers execution until an app is
  // mounted at the adapter; the `to*` runs these against `runFold`.
  readonly guards: ReadonlyArray<(app: object, params: object, ctx: object) => unknown>
  readonly leaf: (deps: object, params: object) => unknown
}

// A fluent fragment. `S` is the carrier (RequestScope for HTTP, JobScope for
// the bus). `Need` accumulates the app requirement, `P` the route params, `Acc`
// the guard enrichments visible to later guards and the leaf.
export interface Fragment<
  S extends object,
  Need extends object,
  P extends object,
  Acc extends object,
> {
  // The app-requirement lives in a DEDICATED first arg (never merged into the
  // ctx bag) so `Need` is recoverable — a merged bag is not subtractable
  // (spike 1). `params` is the second arg (typed, accumulated as an
  // intersection); `ctx` is the carrier plus every prior enrichment.
  guard<Need2 extends object, P2 extends object, E extends object>(
    g: (app: Need2, params: P2, ctx: S & Acc) => E | Abort | Promise<E | Abort>,
  ): Fragment<S, Need & Need2, P & P2, Acc & E>

  // The leaf keeps the two-arg `(deps, params)` shape. It NEVER sees the app:
  // `deps` is the carrier plus enrichments only — repos stay in the guards.
  handle<R>(
    leaf: (deps: S & Acc, params: P) => R | Abort | Promise<R | Abort>,
  ): Handler<Need, P, R>
}

type AnyGuard = (app: object, params: object, ctx: object) => unknown

function makeFragment<
  S extends object,
  Need extends object,
  P extends object,
  Acc extends object,
>(guards: ReadonlyArray<AnyGuard>): Fragment<S, Need, P, Acc> {
  return {
    guard(g) {
      return makeFragment([...guards, g as unknown as AnyGuard])
    },
    handle(leaf) {
      return { guards, leaf: leaf as Handler<Need, P, never>['leaf'] }
    },
  }
}

// Start empty. `{} & X` collapses cleanly, so the accumulators begin at `{}`.
export function fragment(): Fragment<RequestScope, {}, {}, {}> {
  return makeFragment<RequestScope, {}, {}, {}>([])
}

// The carrier-parametrized entry point — the bus (JobScope) and any future
// non-HTTP host start here.
export function fragmentFor<S extends object>(): Fragment<S, {}, {}, {}> {
  return makeFragment<S, {}, {}, {}>([])
}
