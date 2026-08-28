// The deps-vs-Pub brand. At the adapter, `Need` (the scope's app
// requirement) and `Pub` (the chain's public surface) are two independent
// inferred generics with no shared annotated slot — contravariance cannot
// relate them, so a brand is required. The conditional vanishes on
// success (`X & unknown = X`, so the handler is accepted unchanged) and becomes
// an unsatisfiable branded object on failure (the handler argument no longer
// assignable — a compile error at the `to*`/registrar line naming the gap).
//
// `Pub extends Need` accepts a SUPERSET Pub — a chain that exposes more than a
// scope requires is fine; extra singletons are ignored. Under
// exactOptionalPropertyTypes the failure surfaces as TS2379 (missing branded
// property), not TS2345, but it still lands on the handler argument.
export type DepGuard<Pub, Need> = Pub extends Need
  ? unknown
  : { readonly __ERROR_chain_Pub_missing_deps: Need }

// The carrier-capability brand — the same mechanism on the carrier axis. `Cap`
// is the set of capabilities the scope requires (e.g. `'body'`); `HostCaps`
// is what the target host's carrier provides. When `Cap ⊆ HostCaps` the
// conditional vanishes (`X & unknown = X`) and the handler is accepted; else it
// becomes an unsatisfiable branded object naming the missing capability, so the
// mount (`to*`/registrar) is a compile error — e.g. a body-reading scope on
// tRPC (no readable body) is rejected at `toProcedure(...)`, before runtime.
export type CarrierGuard<Cap, HostCaps> = [Exclude<Cap, HostCaps>] extends [never]
  ? unknown
  : { readonly __ERROR_host_missing_capability: Exclude<Cap, HostCaps> }

// The intent brand — the same `Exclude` machine again, on the outcome-vocabulary
// axis (`scope.ts`'s `MountGate`, restated here as a template-literal message on
// the `DupKeyMsg` model, `packages/wire/src/chain.ts:98`, so it reads at the
// mount the way `DeclGate` reads at the definition). `Int` is every intent the
// scope's guards/leaf can PRODUCE; `HostInt` is what the target host renders.
// When `Int ⊆ HostInt` the conditional vanishes and the handler is accepted;
// else it names the first intent the host cannot render, at the `to*`/
// registrar call — e.g. a scope that `redirect()`s is rejected at
// `toProcedure(...)`, an RPC mount with nowhere to redirect to.
export type IntentGuard<Int, HostInt> = [Exclude<Int, HostInt>] extends [never]
  ? unknown
  : `⛔ this host cannot render the intent: ${Exclude<Int, HostInt> & string}`
