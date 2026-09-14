---
title: "The engine is guaranteed by tests; the types guarantee the user"
area: meta-contract
status: accepted
---

# The engine is guaranteed by tests; the types guarantee the user

**Decision.** Internal `any`s exist where TypeScript cannot express the
engine (an array cannot carry each layer's evolving generics). The
user-facing contract compensates: every configuration error surfaces at
the call site at compile time, and the `*.test-d.ts` suite is the
executable specification of that contract — a refactor that breaks it is
wrong even if runtime tests pass.
