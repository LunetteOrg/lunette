---
title: "`override` is the explicit replacement door"
area: keys-visibility-composition
status: accepted
---

# `override` is the explicit replacement door

**Decision.** `override(fn)` replaces keys that **already exist** (a typo
is a compile error naming it), may change the key's type (fakes,
variants), and preserves the key's visibility.

**Why.** Replacement must be distinguishable from accidental collision —
one is intent, the other is a bug.
