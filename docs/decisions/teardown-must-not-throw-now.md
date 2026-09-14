---
title: "Teardown must not throw (for now)"
area: resources-lifecycles
status: accepted
---

# Teardown must not throw (for now)

**Decision.** Documented convention: catch inside the teardown's
`finally`. A teardown that throws while the scope is already failing
masks the original error (plain JavaScript semantics), and the engine
cannot intercept it because teardown is user code inside the layer's own
try/finally. Aggregation (at least for keyed layers) stays an open item.
