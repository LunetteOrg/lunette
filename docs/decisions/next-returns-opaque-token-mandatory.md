---
title: "`next` returns an opaque token and is mandatory"
area: core-shape
status: accepted
---

# `next` returns an opaque token and is mandatory

**Decision.** `next` returns `Provided<P>`, an opaque branded token; a
layer can only produce one by calling `next`.

**Why.** Forgetting to call `next` becomes a compile error instead of a
silently broken chain. The token is also the natural passage point for a
response value if a request-time axis is ever added.

**Updated by [`use` as the one primitive](./use-primitive-provide-expose-sugar-over.md).** The token's second slot is now the public subset
(`Provided<All, Pub>`); the reserved Response channel, if it ever lands,
becomes the third slot (`Provided<All, Pub, R>`).
