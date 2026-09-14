---
title: "Singletons are structural; no layer memoization"
area: resources-lifecycles
status: accepted
---

# Singletons are structural; no layer memoization

**Decision.** A layer runs once per run: within a chain, singletons need
no machinery. Verticals *require* shared infrastructure via their Seed
(the root creates it once); independent processes share by passing one
chain's built app as another's seed.

**Alternatives.** Effect-style layer memoization (same layer reference ⇒
same instance everywhere, refcounted teardown): rejected because it makes
lifecycle ownership implicit — "who closes this and when" must be
readable in the code.
