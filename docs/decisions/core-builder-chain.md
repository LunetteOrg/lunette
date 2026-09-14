---
title: "The core is a builder chain"
area: core-shape
status: accepted
---

# The core is a builder chain

**Decision.** Dependencies compose through a chained builder
(`lunette().use(...).provide(...).expose(...)`).

**Alternatives.** (a) A functional pipe — `compose(layer1, layer2, ...)`
in a single call: proven viable (inference holds), but it requires one
overload per arity, a permanent structural cost. (b) Order-free layers
with runtime `requires` keys and topological resolution: order
independence, but requirements end up declared twice (runtime key list +
type annotation) with no way to enforce consistency — kept alive as
[`research/order-free-layers/`](../research/order-free-layers/), prior
art for parallel boot. (c) An Effect-style tag registry: exactly the
ceremony this project exists to avoid.

**Why.** The chain has the best inference ergonomics, the simplest
internal types, and its linear order doubles as the topological sort —
checked by the compiler, performed by the human.
