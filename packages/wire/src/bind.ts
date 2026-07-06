// The binder: applies a record of bare leaves to its deps — once, per
// call through a window, or per call with the window derived from a key.

import type { With } from './window.ts'

// THE BINDING: bind(record) takes the BARE LEAVES (flat use cases
// `(deps, ...args) => error | result` that declare their deps in the
// signature but do not own them) and returns THE BINDER — the record's
// partial application, waiting for the deps:
//
//   bind(record)(deps)         FIXED deps — a value, bound once
//   bind(record).with(window)  deps PER CALL — every call opens the
//                              window, builds the deps inside it, closes.
//                              Transactionality is declared at the wiring;
//                              the call site stays a plain function call.
//   bind(record).by(toWindow)  deps PER CALL, window DERIVED — every bound
//                              leaf gains ONE leading KEY argument
//                              (monthly('acme', period)); toWindow(key)
//                              picks the window (tenant pool, idempotency
//                              guard, shard). The leaf NEVER sees the key:
//                              the key is wiring, not domain — when the
//                              domain needs it, the bridge closes over it
//                              and hands it in through the deps.
//
// One arity, one meaning: there is no second argument to forget, and the
// binder is shaped like a provider — `.expose(bind({ getAuthor }))` wires
// a record point-free (the ctx arrives as the deps). The binder's
// parameter is the INTERSECTION of every leaf's declared deps: an unmet
// requirement names the missing keys at the application. Composition rule
// unchanged: decorate the exposed leaves, compose the bare ones (a
// composite calls the bare leaf with its own deps → same window by
// construction).
type Leaf = (deps: any, ...args: any[]) => unknown

type UnionToIntersection<U> = (
  U extends unknown ? (u: U) => void : never
) extends (i: infer I) => void
  ? I
  : never

// Everything the record's leaves ask for, as one object: the binder's
// parameter and the window's lending contract.
type DepsOf<M> = UnionToIntersection<
  {
    [K in keyof M]: M[K] extends (deps: infer D, ...args: any[]) => unknown
      ? D
      : never
  }[keyof M]
>

// The leaf's own args and return, past the deps: the one extraction every
// bound shape below needs.
type LeafArgs<L> = L extends (deps: any, ...args: infer A) => unknown ? A : never
type LeafReturn<L> = L extends (deps: any, ...args: any[]) => infer R ? R : never

type Bound<M> = {
  [K in keyof M]: (...args: LeafArgs<M[K]>) => LeafReturn<M[K]>
}

type BoundPerCall<M> = {
  [K in keyof M]: (...args: LeafArgs<M[K]>) => Promise<Awaited<LeafReturn<M[K]>>>
}

// The bound record of the derived-window form: every leaf gains one
// leading KEY argument; the leaf itself receives only its own args.
// Derived from BoundPerCall, not restated, so the two stay in lockstep.
type BoundByKey<M, Key> = {
  [K in keyof M]: (
    key: Key,
    ...args: Parameters<BoundPerCall<M>[K]>
  ) => ReturnType<BoundPerCall<M>[K]>
}

// The binder is a plain function carrying the two per-call cadences as
// properties — the same house shape as Lazy<T> (a callable with
// `created`). It must stay this stupid: no fluent surface beyond these.
export type Binder<M> = ((deps: DepsOf<M>) => Bound<M>) & {
  with: (window: With<DepsOf<M>>) => BoundPerCall<M>
  by: <Key>(toWindow: (key: Key) => With<DepsOf<M>>) => BoundByKey<M, Key>
}

export const bind = <M extends Record<string, Leaf>>(record: M): Binder<M> => {
  const entries = Object.entries(record)
  // The three cadences share the same "one wrapper per leaf" shape; only
  // how each leaf's deps get produced varies.
  const mapEntries = <T>(project: (uc: Leaf) => T): Record<string, T> =>
    Object.fromEntries(entries.map(([name, uc]) => [name, project(uc)]))
  // The bridge every per-call cadence opens a window with: close the
  // leaf's own args over it, so the window only ever sees the deps.
  const bridge = (uc: Leaf, args: unknown[]) => async (deps: any) => uc(deps, ...args)
  // The two casts are engine-internal (decision 23): with M generic the
  // checker cannot relate the runtime mapping to the mapped types.
  const binder = ((deps: object) =>
    mapEntries(
      (uc) =>
        (...args: unknown[]) =>
          uc(deps, ...args),
    )) as unknown as Binder<M>
  binder.with = (w) =>
    mapEntries(
      (uc) =>
        (...args: unknown[]) =>
          w(bridge(uc, args)),
    ) as BoundPerCall<M>
  binder.by = ((toWindow: (key: unknown) => With<object>) =>
    mapEntries(
      (uc) => (key: unknown, ...args: unknown[]) =>
        toWindow(key)(bridge(uc, args)),
    )) as unknown as Binder<M>['by']
  return binder
}
