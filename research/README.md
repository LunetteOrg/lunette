# research

Live research prototypes — evidence, not products. Every tenant has a
stated purpose and a RETIREMENT CONDITION; when the condition fires and
nothing references the prototype anymore, it gets deleted.

| prototype | what it proves | referenced by | retires when |
|---|---|---|---|
| [`order-free-layers/`](./order-free-layers/) | prior art: order independence via runtime `requires` keys, and why it was not chosen | decision 1; parallel-boot issue #16 | issue #16 closes, either way |
| [`module-shapes/`](./module-shapes/) | the executable companion of the feature-modules pattern: code-oriented ↔ fluent behavioural parity, the per-leaf fragment priced out, the window as a named step | `docs/patterns/feature-modules.md` | the real rewrite provides better evidence, or the pattern page grows its own test bench |
