---
title: "`examples/bare-express` is retired; `examples/two-chains` lands first of #59's slices"
area: scope-runtime
status: accepted
---

# `examples/bare-express` is retired; `examples/two-chains` lands first of #59's slices

**Decision.** `examples/bare-express` does not come back. `examples/two-chains`
is rewritten against the settled core and ships as the first of #59's slices —
one issue, several PRs, rather than the 191-file drop the old branch produced.

**`bare-express`'s whole thesis was a fact of the OLD architecture, not a
choice anyone still makes.** It existed to answer "what if lunette ships no
adapter for my host" by hand-wiring one: a Fetch-shaped carrier lifted from a
Node request, a cookie codec, an `Outcome` renderer with three branches, and
the capability/intent brands checked at the mount (`CarrierGuard`,
`IntentGuard`). Every one of those is retired — `Outcome` with [the outcome leaving the core](./outcome-leaves-core-scope-hands-back.md), capabilities
and intents as a checked vocabulary with [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md), `runScope`/`Handler` with the
whole pre-#30 core. What replaced them is `@lntt/scope/express` itself: the
carrier IS the minimal native mount, shipped, not a package to avoid. There is
no "with adapter" path left to contrast a "without" one against — the two
converged, which was the win #60 shipped, not a gap this issue needs to
re-open. Nothing a rewrite of `bare-express` could still teach is not already
on the page in `packages/scope/README.md`.

**`two-chains` ports without a comparable rewrite of its thesis.** `@lntt/wire`
(`lunette`, `layer`, `.use`, `.expose`, `chain.build`) is unchanged by the scope
rebuild, and the bracket that used to be `@lntt/integration`'s job — build a
chain once, hand its public surface to a host mount as `deps` — turned out to
need no package at all: `express(built.app)` is the whole of it, already
proven in `research/with-scope-hosts/src/express/bootstrap`. What changed is
only the scope half: no `.handle()`, no `http`/`unauthorized()`/`notFound()`,
`.guard()` from `@lntt/scope/guard` instead, and a leaf that answers on `res`
directly rather than returning a value for an adapter to render.

**The admin product's gate is the #67 pattern, used rather than only
described.** `gated = scope(expressCarrier()).extend(guards).guard(findAuth,
onError)` is built once; `auditScope` and `recordScope` both call `.step()` on
that SAME value. No mechanism beyond what the builder already is — which is
exactly what [the scope VALUE as the reusable unit](./reusable-sequence-steps-needs-no-packaging.md) already says it is.

**One casualty of dropping `@lntt/integration`'s per-pack build: the
"each product is built lazily, only when its own route is first hit" claim.**
That was a feature of the specific host-pack shape the old
`@lntt/integration/express` had, not a `@lntt/wire` or `@lntt/scope` core
guarantee — `chain.build()` itself runs eagerly the moment it is called.
`examples/two-chains` now builds both chains when `makeApp` is awaited, and the
test suite asserts ISOLATION (neither product's state leaks into the other's)
rather than DEFERRAL. `buildOnce` ([build-once as a free function the host holds](./build-once-free-function-host-holds.md)) is the tool for lazy, memoized builds
where that is wanted, on top of a mount that calls it per request — a
different example's job if a case for it turns up, not a silent claim
`two-chains` no longer backs.
