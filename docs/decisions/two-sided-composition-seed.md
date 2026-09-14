---
title: "Two-sided composition: the Seed"
area: keys-visibility-composition
status: accepted
---

# Two-sided composition: the Seed

**Decision.** `lunette<{ env: Env }>()` declares requirements the chain
does not build; `run`/`build` demand them as their first argument and do
not compile without them. The seed is private.

**Why.** Chains become mountable fragments with a checkable contract
(à la Hono's Bindings, Effect's `Layer<RIn, ROut>`), and platforms where
configuration arrives late (per-request env) get a principled entry
point.
