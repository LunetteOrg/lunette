// "Needs a transaction" lives in the type (decision 16). The brand is produced
// ONLY by the transactional bridge (one cast, there), so wiring a branded leaf
// outside a window does not compile, and the requirement propagates through
// composition — which also makes nested transactions unwritable by accident.
declare const atomic: unique symbol

export type Tx<D> = D & { readonly [atomic]: true }
