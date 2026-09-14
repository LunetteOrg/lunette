---
title: "Per-request-env platforms get a lazy memoized boot"
area: extensibility
status: accepted
---

# Per-request-env platforms get a lazy memoized boot

**Decision.** `worker(engine, seedFrom)` produces the platform's export
shape; the chain boots lazily on the first request and memoizes **the
promise** (memoizing the app would race under concurrent first requests).
No dispose: such platforms kill isolates, they do not shut down. The same
promise-memo recipe solves dev-server module re-evaluation (HMR).
