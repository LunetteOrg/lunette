// The window: the lending contract (With) and the builder that assembles
// a window from its opener and its bridge.

// THE WINDOW: lends deps that are valid only inside the callback — open,
// use, close, and the result passes through. Same shape as run's scope
// and the layers' try/finally. Instances: db transaction, tracing span,
// timeout, per-tenant connection. The window may execute `use` 0 times
// (circuit breaker), 1 (the normal case) or N (retry) — and the error
// convention is the pivot: RETURNED errors (domain) are values that pass
// through (commit, no retry); THROWN errors (infrastructure) make the
// window react (rollback, retry).
export type With<Deps> = <T>(use: (deps: Deps) => Promise<T>) => Promise<T>

// A window built from its two parts. `open` is THE OPENER, already
// callback-shaped (db.transaction is): lends a raw resource and lets the
// result pass through. `toDeps` is THE BRIDGE: from the raw resource to
// the deps shape the leaves declare ({ db: tx }, whole repos, a mix with
// boot pieces captured by closure) — executed INSIDE the window, on every
// call.
//
//   bind({ verifyCode }).with(window(db.transaction, (tx) => ({ db: tx })))
//
// Note: if `transaction` is a method that uses `this`, passing it
// detached breaks it — use `db.transaction.bind(db)` in that case.
// Note: the export deliberately claims the name `window` — composition
// roots are server code; the DOM global is not a neighbour there.
export const window =
  <Raw, Deps>(
    open: <T>(fn: (raw: Raw) => Promise<T>) => Promise<T>,
    toDeps: (raw: Raw) => Deps,
  ): With<Deps> =>
  (use) =>
    open((raw) => use(toDeps(raw)))
