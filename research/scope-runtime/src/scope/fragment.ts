import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort } from './abort.ts'
import type { RequestScope } from './scope.ts'
import { unit, type OutputOf, type UnitSchema } from './schema.ts'

// The abstract fragment: an input schema + a guard/leaf stack captured as data,
// bound to NO app. `Handler` now carries the REAL input `schema` (the object a
// host hands to its native validator) alongside two phantom markers. `__need`
// and `__result` stay phantom and LOAD-BEARING: drop them and two Handlers with
// the same schema become structurally identical, the adapter infers `unknown`,
// and the deps check silently disables (spike 1, caveat 2). The `schema` field
// is what pins `InferInput`/`InferOutput` for every host's native validator, so
// the same object feeds Hono's `sValidator`, tRPC's `.input`, and our own
// RR7/Express/bus runtime validation.
export interface Handler<Need extends object, S extends StandardSchemaV1, R> {
  readonly schema: S
  // Erased fold ingredients — the fragment defers execution until an app is
  // mounted at the adapter; `runFold`/`runScope` run these.
  readonly guards: ReadonlyArray<(app: object, params: object, ctx: object) => unknown>
  readonly leaf: (deps: object, params: object) => unknown
  readonly __need?: (n: Need) => void
  readonly __result?: R
}

// A fluent fragment. `Carrier` is the host carrier (RequestScope for HTTP,
// JobScope for the bus). `S` is the input schema, FIXED by `.input` (or the
// unit schema for param-less fragments) — the single source of the params type
// `OutputOf<S>` that EVERY guard and the leaf read. `Need` accumulates the app
// requirement; `Acc` the guard enrichments visible to later guards and the leaf.
export interface Fragment<
  Carrier extends object,
  S extends StandardSchemaV1,
  Need extends object,
  Acc extends object,
> {
  readonly schema: S

  // The app-requirement lives in a DEDICATED first arg (never merged into the
  // ctx bag) so `Need` is recoverable — a merged bag is not subtractable
  // (spike 1). `params` is the schema OUTPUT, identical for every guard; `ctx`
  // is the carrier plus every prior enrichment.
  guard<Need2 extends object, E extends object>(
    g: (app: Need2, params: OutputOf<S>, ctx: Carrier & Acc) => E | Abort | Promise<E | Abort>,
  ): Fragment<Carrier, S, Need & Need2, Acc & E>

  // The leaf keeps the two-arg `(deps, params)` shape. It NEVER sees the app:
  // `deps` is the carrier plus enrichments only — repos stay in the guards.
  handle<R>(
    leaf: (deps: Carrier & Acc, params: OutputOf<S>) => R | Abort | Promise<R | Abort>,
  ): Handler<Need, S, R>
}

// `.input` is reachable ONLY as the FIRST call: `FragmentStart` extends a plain
// `Fragment` over the unit schema (so a param-less fragment uses `.guard`/
// `.handle` directly with `P = {}`) and ADDS `input`, which widens into a
// `Fragment` fixed to the chosen schema — with no `.input` thereafter. This
// locks the "one input contract per fragment" rule at the type level, no
// runtime machinery.
export interface FragmentStart<Carrier extends object>
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  extends Fragment<Carrier, UnitSchema, {}, {}> {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  input<S extends StandardSchemaV1>(schema: S): Fragment<Carrier, S, {}, {}>
}

type AnyGuard = (app: object, params: object, ctx: object) => unknown

function makeFragment<
  Carrier extends object,
  S extends StandardSchemaV1,
  Need extends object,
  Acc extends object,
>(schema: S, guards: ReadonlyArray<AnyGuard>): Fragment<Carrier, S, Need, Acc> {
  return {
    schema,
    guard(g) {
      return makeFragment(schema, [...guards, g as unknown as AnyGuard])
    },
    handle(leaf) {
      return { schema, guards, leaf: leaf as Handler<Need, S, never>['leaf'] }
    },
  }
}

// Start empty over the HTTP carrier. `.input` locks the schema; skipping it
// keeps the unit schema (`P = {}`). `{} & X` collapses cleanly.
export function fragment(): FragmentStart<RequestScope> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    ...makeFragment<RequestScope, UnitSchema, {}, {}>(unit, []),
    input(schema) {
      return makeFragment(schema, [])
    },
  }
}

// The carrier-parametrized entry point — the bus (JobScope) and any future
// non-HTTP host start here.
export function fragmentFor<Carrier extends object>(): FragmentStart<Carrier> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    ...makeFragment<Carrier, UnitSchema, {}, {}>(unit, []),
    input(schema) {
      return makeFragment(schema, [])
    },
  }
}
