// The deps-vs-Pub brand. At the adapter, `Need` (the fragment's app
// requirement) and `Pub` (the chain's public surface) are two independent
// inferred generics with no shared annotated slot — contravariance cannot
// relate them, so a brand is required (spike 1). The conditional vanishes on
// success (`X & unknown = X`, so the handler is accepted unchanged) and becomes
// an unsatisfiable branded object on failure (the handler argument no longer
// assignable — a compile error at the `to*`/registrar line naming the gap).
//
// `Pub extends Need` accepts a SUPERSET Pub — a chain that exposes more than a
// fragment requires is fine; extra singletons are ignored. Under
// exactOptionalPropertyTypes the failure surfaces as TS2379 (missing branded
// property), not TS2345, but it still lands on the handler argument.
export type DepGuard<Pub, Need> = Pub extends Need
  ? unknown
  : { readonly __ERROR_chain_Pub_missing_deps: Need }
