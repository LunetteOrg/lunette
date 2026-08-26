import type { BuiltOf, Lunette, SeedOf } from './chain.ts'

// Build-once: one app per process (or per isolate), constructed lazily on first
// use and memoized. NOT a performance cache — an IDENTITY guarantee. The chain's
// singletons (a db pool, a client) must exist once; a second build would open a
// second pool and leave the first with no owner.
//
// It is a FREE FUNCTION, not a method on `Lunette`, and deliberately so: the
// chain stays a value that can be built as many times as you like — that is what
// makes seeds a mocking device and lets tests build with a different env. This
// mirrors where the industry puts it (a caller-held wrapper — NestJS's cached
// server on Lambda, Effect's `ManagedRuntime.make`), while Symfony's memoizing
// `Kernel::boot()` answers a problem we do not have (a process that dies each
// request). See §36.
//
// The build is LAZY because of the constraint no classic container has: on
// Cloudflare Workers the bindings only exist inside the fetch handler, so there
// is no startup moment at which the seed is available. The flip side is that the
// memo lives as long as the isolate, which we do not control: a deploy changing
// ONLY bindings may reuse running isolates and keep serving an app built from
// the old ones. No reliable detection exists on our side (#39).

export interface BuildOnce<C> {
  // Build if needed, then hand back the same `{ app, dispose }` forever. The
  // seed is a THUNK evaluated ONLY on the build that happens: a host calling
  // this per request must not pay for a seed that will be discarded, and the
  // signature must not promise a per-request seed it ignores. A seed that
  // varies per call is therefore never even computed — the per-call axis is the
  // window (principle 4), never a second app (§36).
  ensure(seed: () => SeedOf<C>): Promise<BuiltOf<C>>
  // Tear the chain down. A handle that never built has nothing to close.
  dispose(): Promise<void>
}

export function buildOnce<C extends Lunette<any, any, any>>(chain: C): BuildOnce<C> {
  let built: Promise<BuiltOf<C>> | undefined
  const build = chain.build.bind(chain) as unknown as (seed: SeedOf<C>) => Promise<BuiltOf<C>>
  return {
    // The PROMISE is memoized, not the resolved app: callers racing the first
    // ensure share the one build instead of each starting a chain of their own.
    //
    // A REJECTED promise is dropped, so the next `ensure` builds again. What is
    // memoized is one SUCCESSFUL build, not one attempt: a rejected promise is
    // not nullish, so keeping it would make a single transient failure — a pool
    // that could not connect, a secret that did not resolve — permanent for the
    // life of the process or isolate, and on a lazy build that first attempt is
    // a REQUEST, not startup. Callers already sharing the failing build still
    // share its failure; only a caller arriving after it settles starts a new
    // one. Safe because a failed build unwinds: each layer's `finally` runs on
    // the way out, so nothing it opened is left orphaned (§36).
    ensure: (seed) =>
      (built ??= build(seed()).catch((error: unknown) => {
        built = undefined
        throw error
      })),
    // Teardown must work in the state that calls for it, so a build that failed
    // is not allowed to take `dispose` down with it: awaiting a rejected handle
    // would rethrow, leaving no way to close what did succeed.
    dispose: async () => {
      const pending = built
      if (!pending) return
      const handle = await pending.catch(() => undefined)
      await handle?.dispose()
    },
  }
}
