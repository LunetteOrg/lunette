---
title: "Dialects via `pipe`, never verbs grafted into the core"
area: extensibility
status: accepted
---

# Dialects via `pipe`, never verbs grafted into the core

**Decision.** The core gained exactly one hook: `pipe<R>(fn): R`. Domains
(http, cli, listener, flow) are *dialects* — builders that receive the
chain and own their verbs' signatures and behaviour completely.

**Alternatives.** Layers contributing verbs to the chain itself
(`.use(httpExt)` → the chain gains `.route(...)`), which requires a
fourth type parameter and a mapped-intersection chain type. Weighed and
rejected for measurable inference costs: handler contextual typing
through registry encodings degrades, error messages become type walls,
checker performance suffers at scale, and the guard machinery becomes
public API that every extension author must wield correctly.

**Why.** A native dialect costs ~60 lines and proves the ecosystem path;
a half-good extension mechanism is the most expensive kind of API because
it cannot be removed.
