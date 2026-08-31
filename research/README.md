# research

Live research prototypes — evidence, not products. Every tenant has a
stated purpose and a RETIREMENT CONDITION; when the condition fires and
nothing references the prototype anymore, it gets deleted.

| prototype | what it proves | referenced by | retires when |
|---|---|---|---|
| [`order-free-layers/`](./order-free-layers/) | prior art: order independence via runtime `requires` keys, and why it was not chosen | decision 1; parallel-boot issue #16 | issue #16 closes, either way |
| [`terminal-step/`](./terminal-step/) | that a step declaring it TERMINATES can close the builder on its own, so `.handle` is sugar rather than a second mechanism — and what that costs (measured: constant per scope, not per step) | the scope builder on #30 | superseded: the builder needs no closing at all, see below. Kept as the prior art that answer was reached through |
| [`parameterised-builder/`](./parameterised-builder/) | that carrying the builder's state in a type PARAMETER rather than in phantoms read through `Self` costs LESS (measured: −54 instantiations per scope, −11 per step, types −16%) — which makes the scope callable from the first line, lets `R` accumulate as a union, and removes the termination declaration entirely | the scope builder on #30 | `@lntt/scope`'s builder settles on one idiom or the other |
