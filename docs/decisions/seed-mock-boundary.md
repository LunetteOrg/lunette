---
title: "The seed is the mock boundary"
area: testing
status: accepted
---

# The seed is the mock boundary

**Decision.** Wiring lives in fragments that *require* infrastructure;
tests run them with a seed of fakes, so the real resource is never
created. On top: `test(chain)` applies per-key substitutions at the
key's **birth** (downstream closures get the fake regardless of
position), typed `Seed & Partial<Ctx>`; keyed verbs make a substituted
layer **skippable outright**; `fake<T>(partial)` is a strict stub that
throws by name on unstubbed access. `override` is positional and
documented as such (it cannot rewrite already-wired closures, and the
original layer still runs) — it is for deliberate variants, not mocks.

**Why this ladder.** Each rung trades structure for pragmatism; the
pitfalls of the pragmatic rungs are documented by tests, not hidden.
