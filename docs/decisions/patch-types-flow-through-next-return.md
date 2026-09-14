---
title: "Patch types flow through `next`'s return"
area: core-shape
status: accepted
---

# Patch types flow through `next`'s return

**Decision.** `next` is itself generic and returns the patch it receives;
the patch type P surfaces in the layer's **return type**.

**Alternatives.** Typing the patch as a parameter of `next` declared in
the layer signature — the patch then sits in a contravariant position
where TypeScript's inference degrades to `unknown`.

**Why.** Return-position inference is reliable. This one trick is the
foundation of the whole API's "no annotations needed" property.
