---
title: "`.by` on the binder: the derivation key is not a leaf argument"
area: verb-model
status: accepted
---

# `.by` on the binder: the derivation key is not a leaf argument

**Decision.** `bind(record).by(toWindow)` covers windows DERIVED per call
(per-tenant connection, idempotency guard, shard): every bound leaf gains
ONE leading KEY argument — `monthly('acme', period)` — the binder passes
it to `toWindow(key)`, opens the derived window, and calls the leaf with
its OWN arguments only. The leaf never sees the key: the key is wiring
(WHICH world to open), not domain. When the domain needs it (the id in
the query), the bridge closes over the key and hands it in through the
deps (`(tenant) => window(opener(tenant), (conn) => ({ conn, tenant }))`).
The key is a single parameter by design — a composite key is one object —
so the runtime split is positional (first argument), with no
`Function.length` inspection. `.with(w)` remains the degenerate fixed
case (`.by` with a derivation that ignores the key).

**Alternatives.**
- (a) The old standalone `bindBy(toWindow, leaf)` (superseded):
  `toWindow` mirrored the leaf's FULL argument list and the leaf received
  the key too. That polluted the domain signature with a wiring concern
  (a composite would thread the tenant through every call), and it forced
  single-leaf — a record was untypeable, because one `toWindow` cannot
  mirror heterogeneous argument lists.
- (b) Variadic keys (bound args `[...Keys, ...Args]`): the runtime split
  would need `toWindow.length` — a silent footgun with default and rest
  parameters. One key, positional, explicit.
- (c) A curried bound form (`monthly('acme')('2026-06')`): split-free and
  more general, but a double call at every route call site.
- (d) A single-leaf binder (`bind(leaf)`, no braces): rejected. A
  function's NAME does not exist in the type system (`fn.name` is
  runtime-only), so `bind(leaf)` alone cannot produce a typed `{ leaf: … }`
  record — and the name is load-bearing (it is the Pub key the routes
  call). The keyed verbs COULD lend the name
  (`.expose('composeComment', bind(composeComment))` would type), but
  that spelling writes the name twice (string + identifier) and the two
  can drift silently: renaming the leaf updates the identifier, never the
  string, and the Pub keeps publishing the old key with no error —
  against principle 1. The shorthand record `{ leaf }` writes the name
  once, is refactor-safe (a rename breaks/updates the shorthand), and
  scales to plural, aliases and spreads. Division of labour: key literals
  name VALUES and namespaces (which have no name of their own); record
  braces name LEAVES (whose identifier already is the name). Separating
  the key from the leaf's arguments is also what made the RECORD form
  typeable for `.by`, so no second entry form exists.

**Why.** Taking the key out of the leaf's signature is what unlocked
everything: leaves stay pure domain (`report(deps, period)`; use-case
files keep ZERO wire imports; composites compose without threading
tenancy), and `bindBy`'s single-leaf limitation dissolves. Prior art for
the shape: cats-effect `Resource.use` / Haskell `managed` built from the
call's input, Rails `Apartment::Tenant.switch`, Autofac.Multitenant
(scope keyed by tenant id). The mainstream alternative puts the key in an
ambient channel (Spring `AbstractRoutingDataSource` + ThreadLocal,
Hibernate tenant resolvers, AsyncLocalStorage tenancy) — rejected by
principle 7: the arguments are the only per-call channel the design
admits, typed and visible.

**Superseded:** the standalone `bindBy` export — implemented with
key-mirrors-args semantics, replaced before any real usage existed.
