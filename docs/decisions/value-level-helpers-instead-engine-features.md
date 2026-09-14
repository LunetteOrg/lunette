---
title: "Value-level helpers instead of engine features"
area: resources-lifecycles
status: accepted
---

# Value-level helpers instead of engine features

**Decision.** `lazy`/`lazyAsync` (deferred expensive creation; `created()`
for conditional teardown; async variant shares the in-flight attempt and
clears the memo on failure so retry stays possible) and `circular()`
(legacy cycle escape hatch: one edge becomes a runtime getter, explicit
and greppable). The engine knows nothing about them.

**Why.** Laziness and cycle-breaking are properties of *values*;
cross-layer cycles remain unwritable by construction, so only the
explicit, visible escape needs to exist.
