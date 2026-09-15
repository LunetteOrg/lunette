// The lease: the lending contract (Lease) and the builder that assembles
// a lease from its opener and its bridge.

// THE LEASE: lends deps that are valid only inside the callback — open,
// use, close, and the result passes through. The grant is bounded and the
// lender takes it back whatever happens; the borrower never returns it.
// Same shape as run's scope and the layers' try/finally. Instances: db
// transaction, tracing span, timeout, per-tenant connection. The lease may
// execute `use` 0 times (circuit breaker), 1 (the normal case) or N
// (retry — N separate grants, not one held open) — and the error
// convention is the pivot: RETURNED errors (domain) are values that pass
// through (commit, no retry); THROWN errors (infrastructure) make the
// lease react (rollback, retry).
export type Lease<Deps> = <T>(use: (deps: Deps) => Promise<T>) => Promise<T>

// A lease built from its two parts. `open` is THE OPENER, already
// callback-shaped (db.transaction is): lends a raw resource and lets the
// result pass through. `toDeps` is THE BRIDGE: from the raw resource to
// the deps shape the leaves declare ({ db: tx }, whole repos, a mix with
// boot pieces captured by closure) — executed INSIDE the lease, on every
// call.
//
//   bind({ verifyCode }).with(lease(db.transaction, (tx) => ({ db: tx })))
//
// Note: if `transaction` is a method that uses `this`, passing it
// detached breaks it — use `db.transaction.bind(db)` in that case.
export const lease =
  <Raw, Deps>(
    open: <T>(fn: (raw: Raw) => Promise<T>) => Promise<T>,
    toDeps: (raw: Raw) => Deps,
  ): Lease<Deps> =>
  (use) =>
    open((raw) => use(toDeps(raw)))
