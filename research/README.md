# research

Live research prototypes — evidence, not products. Every tenant has a
stated purpose and a RETIREMENT CONDITION; when the condition fires and
nothing references the prototype anymore, it gets deleted.

| prototype | what it proves | referenced by | retires when |
|---|---|---|---|
| [`order-free-layers/`](./order-free-layers/) | prior art: order independence via runtime `requires` keys, and why it was not chosen | decision 1; parallel-boot issue #16 | issue #16 closes, either way |
| [`bootstrap-replica/`](./bootstrap-replica/) | a real-shaped composition root holds up the design (story #1); doubles as the lead adoption example | issue #1; the package READMEs | the real bootstrap rewrite exists — and possibly not even then (it may stay as the permanent anonymized example) |
| [`module-shapes/`](./module-shapes/) | the executable companion of the feature-modules pattern: code-oriented ↔ fluent behavioural parity, the per-leaf fragment priced out, the window as a named step | `docs/patterns/feature-modules.md` | the real rewrite provides better evidence, or the pattern page grows its own test bench |
