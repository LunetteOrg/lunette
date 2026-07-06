// Value-level helpers: laziness for expensive creations, and the
// explicit escape hatch for circular dependencies.

// Value-level laziness: the layer stays eager, the VALUE defers the
// expensive work (connection, warm-up, in-memory index) to the first
// call. `created()` lets the teardown close only what actually started.
export type Lazy<T> = { (): T; created: () => boolean }

export const lazy = <T>(create: () => T): Lazy<T> => {
  let value: T
  let done = false
  const get = () => {
    if (!done) {
      value = create()
      done = true
    }
    return value
  }
  get.created = () => done
  return get
}

// Async variant for expensive creations (pools, clients with a
// handshake): concurrent callers share the same in-flight attempt, and a
// FAILURE clears the memo — otherwise the first connection error would
// stay cached forever and no retry would ever be possible.
export const lazyAsync = <T>(create: () => Promise<T>): Lazy<Promise<T>> => {
  let inflight: Promise<T> | undefined
  const get = () =>
    (inflight ??= create().catch((error) => {
      inflight = undefined
      throw error
    }))
  get.created = () => inflight !== undefined
  return get
}

// Escape hatch for circular dependencies in legacy codebases: breaks the
// cycle by turning ONE side from "value at construction" into "getter at
// runtime". Explicit and greppable as technical debt — the plan is always
// to invert the dependency and then delete the circular().
export const circular = <T>(): [get: () => T, resolve: (value: T) => T] => {
  let value: T | undefined
  const get = () => {
    if (value === undefined) {
      throw new Error(
        'Circular reference not resolved yet: use the getter at ' +
          'runtime, not while constructing layers.',
      )
    }
    return value
  }
  const resolve = (v: T) => {
    value = v
    return v
  }
  return [get, resolve]
}
