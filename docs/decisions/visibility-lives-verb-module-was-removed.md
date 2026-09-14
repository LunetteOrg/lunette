---
title: "Visibility lives in the verb; `module` was removed"
area: keys-visibility-composition
status: accepted
---

# Visibility lives in the verb; `module` was removed

**Decision.** `use`/`provide` are private, `expose` is public. The chain
tracks `Lunette<Ctx, Pub, Seed>`; `run`/`build` deliver **only** `Pub`,
in the type and at runtime. `module(name, fn)` was removed: with expose,
a namespace is just the shape of the patch.

**Alternatives.** (a) A terminal key-selection
(`expose('auth', 'posts')` at the end of the chain): implemented first,
replaced — string lists to maintain, and visibility belongs to the step,
not to an afterthought. (b) Delivering the full context and policing
access by linter rules (the status quo this design replaces).

**Why.** Private keys that simply *do not exist* on the delivered app
beat any discipline. Corollary, tested: requirement (on `Ctx`) and
visibility (on `Pub`) are independent axes — private keys satisfy module
requirements.

**Superseded:** the namespace API `module(name, fn)` and the terminal
key-selection `expose('auth', 'posts')` — both implemented, then removed
in favour of visibility-in-the-verb. (Grep `Superseded` for every
API that was implemented and later withdrawn.)
