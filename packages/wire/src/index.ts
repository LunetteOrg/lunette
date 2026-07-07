// @lntt/wire — typed dependency wiring as a chain of layers.
//
// The API at a glance:
//
//   use((ctx, next) => …) is THE primitive: next(priv) contributes
//     privately; next(priv, pub) also publishes pub. The full onion lives
//     here (teardown, breaker, retry, per-key visibility split).
//   provide(fn, destroy?) / expose(fn, destroy?) are SUGAR — pre-built use
//     layers (private / public) with an optional acquire/release teardown.
//   use/expose also accept a CHAIN (mount): only its Pub crosses the boundary
//   override (explicit replacement) · run/build (deliver Pub) · seed (private)
//   bind(record) → the binder: apply = fixed deps · .with(window) = per
//     call · .by(key ⇒ window) = per call, window derived from the key
//   layer (helper for reusable layers)
//
// 1. A real onion: the chain stays open for the app's whole lifetime; the
//    code after `await next(...)` is the teardown, in reverse order. The
//    raw mechanism is try/finally; `provide`/`expose`'s `destroy` argument
//    is the acquire/release sugar over it.
//
// 2. `next` returns an opaque Provided<All, Pub> token: All (everything the
//    layer contributes → Ctx) and Pub (the public subset → Pub) both flow
//    up through the layer's return type (reliable inference); the layer is
//    REQUIRED to call next. A reserved third slot is the future passage
//    point for the Response if a request-time axis is ever added.
//
// 3. Visibility lives in the verb (common case) or in the next call (raw
//    escape): the chain tracks Lunette<Ctx, Pub, Seed>. Ctx is everything
//    (downstream steps see it whole), Pub grows through expose (sugar) or
//    next(priv, pub) (raw) and is what run/build deliver, in the type AND
//    at runtime. Requirement (on Ctx) and visibility (on Pub) are
//    independent axes: private keys satisfy module requirements.
//
// 4. Key collisions are an error on two levels: at compile time the verbs
//    reject the offending ARGUMENT — the diagnostic names the duplicated
//    key on the exact colliding line and the chain keeps typing past it —
//    and at runtime the same collision throws. `override` is the explicit
//    door: existing keys only, the type may change, visibility is
//    preserved.
//
// 5. Two-sided composition: `lunette<{ env: Env }>()` declares
//    requirements the chain does NOT build; run/build demand them as the
//    first argument and do not compile without them. The seed is private.
//
// 6. Mount: use/expose accept another chain. ONLY the fragment's Pub
//    crosses the boundary; its privates live in a separate bag (lexical
//    scoping: the bag has the host context as its prototype, so reads
//    fall through to the host and same-named keys SHADOW instead of
//    colliding). The verb decides the visibility of the mounted Pub in
//    the host: use = private (infrastructure fragment), expose = public
//    (feature module). The fragment's Seed is checked against the host's
//    Ctx at the mount point; the optional mapper `use(chain, ctx => seed)`
//    builds it explicitly and doubles as an adapter (renaming at the
//    boundary). One lifecycle: the fragment's entries join the host onion.
//
// 7. `run(seed?, scope)` is the primitive; `build(seed?)` is derived and
//    returns { app, dispose } for hosts that cannot live inside a
//    callback (e.g. React Router's getLoadContext).

export { Lunette, lunette, layer } from './chain.ts'
export type { Provided, Next, Layer, NextValue, ValueLayer, Expand } from './chain.ts'

export { lazy, lazyAsync, circular } from './lazy.ts'
export type { Lazy } from './lazy.ts'

export { window } from './window.ts'
export type { With } from './window.ts'

export { bind } from './bind.ts'
export type { Binder } from './bind.ts'
