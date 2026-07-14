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

// The carrier-capability brand — the same mechanism on the carrier axis. `Cap`
// is the set of capabilities the fragment requires (e.g. `'body'`); `HostCaps`
// is what the target host's carrier provides. When `Cap ⊆ HostCaps` the
// conditional vanishes (`X & unknown = X`) and the handler is accepted; else it
// becomes an unsatisfiable branded object naming the missing capability, so the
// mount (`to*`/registrar) is a compile error — e.g. a body-reading fragment on
// tRPC (no readable body) is rejected at `toProcedure(...)`, before runtime.
export type CarrierGuard<Cap, HostCaps> = [Exclude<Cap, HostCaps>] extends [never]
  ? unknown
  : { readonly __ERROR_host_missing_capability: Exclude<Cap, HostCaps> }
