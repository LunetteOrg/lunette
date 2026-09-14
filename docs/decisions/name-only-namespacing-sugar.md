---
title: "`.as(name)` is the only namespacing sugar"
area: keys-visibility-composition
status: accepted
---

# `.as(name)` is the only namespacing sugar

**Decision.** `fragment.as('ns')` mounts a fragment's whole Pub under one
key. Implemented as a dedicated mount entry (exact Pub pick) rather than
a wrapper that spreads the bag — a directly-run renamed chain must not
leak its seed.

**Alternatives.** (a) A mount option (`use(chain, { at: 'ns' })`):
unnecessary — the two-line wrapper (`lunette().use(frag).expose(...)`)
already solves it; `.as` is that wrapper in one word. (b) Dedicated
alias/namespace helpers, possibly Symbol-based: an alias is a one-line
`provide`, a namespace is the patch shape, and Symbols would reintroduce
tag ceremony (see 19). Helpers must not teach what plain objects already
do.
