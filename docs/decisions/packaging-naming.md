---
title: "Packaging and naming"
area: meta-contract
status: accepted
---

# Packaging and naming

**Decision.** Scoped packages under the `lntt` org (`lunette` was taken
unscoped on npm). The core is `@lntt/wire` — descriptive, with DI
pedigree (wiring, autowire, google/wire); evocative single-word
candidates were explored at length and set aside. Framework dialects ship as
subpaths with **optional** peer dependencies — importing the agnostic entry
pulls in no framework — carried by `@lntt/scope`, which owns the host mounts.
Test utilities are a subpath of the core (`@lntt/wire/testing`), not a
package. `exports` resolve to the build, with the commented sources shipped
beside it and reachable through a declared condition ([the build ships, the sources ship beside it](./build-ships-sources-ship-beside-condition.md)).
