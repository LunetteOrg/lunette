---
title: "A run copies what it was handed, one level, at the entry"
area: core-shape
status: accepted
---

# A run copies what it was handed, one level, at the entry

**Decision.** Neither package passes the caller's own object into what it runs.
`lunette().run(seed, …)` executes against `{ ...seed }`, and a scope execution
hands step 0 `{ ...args }` — the run's own object from the first line. The two
are different lifetimes and the vocabulary keeps them apart: a SEED is wire's
build-once input, EXECUTION PARAMETERS are what belongs to one scope execution.
The obligation is the same, and it is bounded the same way: **one level**.

The copy is made once, at the entry, because everything after it is already the
run's own. In a scope every later step receives `{ ...seen, ...delta }`, so
there is nothing left to protect; in a chain every level merges its patch the
same way. Only the first has nothing to merge, which is what makes it the one
place a write could reach back out.

Being a SPREAD, it takes own enumerable keys, which drops a prototype and
flattens a getter. So the outermost object is constrained to be a plain
container of its own data. That is a constraint on the mount, which is ours, and
on the seed a caller writes, which is why it is stated here as well as at the
line.

**Alternatives.** *Hand the caller's object straight through.* Rejected on the
shape of the defect rather than its size: a write from position 0 — and only
from position 0 — leaves the run and lands in an object the host may reuse for
the next one. The same step one place later is harmless, so the bug is invisible
until someone moves a step, and a reviewer reading either version sees nothing
wrong. *Preserve the prototype and the descriptors* with `Object.create` plus
`getOwnPropertyDescriptors`, which would lift the plain-container constraint.
Rejected where it arises, in the fold: the levels below spread anyway, so step 0
would see a class instance and step 1 a flat object — the position-dependence
removed at one level and reintroduced at the next, which is worse than not
removing it, because now it looks handled. *Copy deeper.* Rejected as the wrong
answer rather than a missing one: what a run is handed carries things that do
not clone — an abort signal, a request, a stream handle — so a deep copy is
either broken or a list of exceptions that grows with the platform.

**Why.** The obligation stops where knowledge stops. A run knows it was handed
an object and must not leak a write back through it; what that object CONTAINS
belongs to the caller, and a write through a nested value still leaves the run.
Saying otherwise would be a promise nothing enforces — the type says the rest,
since `Ctx` is read-only and `Pub` is what a chain exposes. Anything with
BEHAVIOUR belongs in the app, which is passed by reference and is meant to be
shared: that is what an app IS.
