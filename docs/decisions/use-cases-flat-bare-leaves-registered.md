---
title: "Use cases are flat bare leaves, registered with `bind`"
area: leaves-errors-leases
status: accepted
---

# Use cases are flat bare leaves, registered with `bind`

**Decision.** A use case is `(deps, ...args) => error | result` — it
declares deps in its signature but does not own them. `bind(deps, record)`
stitches deps to every leaf in a record (one word per use case);
contravariance checks each entry separately.

**Alternatives.** (a) Curried factories (`(deps) => (input) => ...`):
heavier composition and closure state risks per-instance. (b) A central
pre-wired use-case registry in the bootstrap (the pattern this design
dissolves). (c) Call-site execution (`app.run(useCase)` / `executor`):
implemented, then removed — one-word registration makes call-site
execution redundant, and the direct call `useCase(deps, args)` stays free.

**Why.** Bare leaves compose (a composite calls the bare leaf with its
own deps) and test without machinery.

**Superseded:** call-site execution `app.run(useCase)` / the `executor` —
implemented, then removed (one-word `bind` registration made it
redundant; the direct call `useCase(deps, args)` stays free).

**Updated by [the single-arity `bind`](./bind-single-arity-binder-unit.md).** `bind` is now single-arity: `bind(record)` returns the
binder; applying it ties fixed deps, `.with(lease)` ties them per call.
The bare-leaf shape is untouched — only the registration spelling moved.
