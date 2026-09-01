# research

Live research prototypes — evidence, not products. Every tenant has a
stated purpose and a RETIREMENT CONDITION; when the condition fires and
nothing references the prototype anymore, it gets deleted.

A FIRED condition is not on its own a reason to delete: three of the four below
are cited from `docs/` or from a comment in `packages/`, and a prototype that a
decision rests on is the evidence for that decision. They go when the citation
goes.

| prototype | what it proves | referenced by | retires when |
|---|---|---|---|
| [`order-free-layers/`](./order-free-layers/) | prior art: order independence via runtime `requires` keys, and why it was not chosen | decision 1; parallel-boot issue #16 | issue #16 closes, either way |
| [`terminal-step/`](./terminal-step/) | that a step declaring it TERMINATES can close the builder on its own, so `.handle` is sugar rather than a second mechanism — and what that costs (measured: constant per scope, not per step) | the scope builder on #30 | superseded: the builder needs no closing at all, see below. Kept as the prior art that answer was reached through |
| [`collapsed-outcome/`](./collapsed-outcome/) | what the scope's OUTCOME costs in four shapes — two branches (today), collapsed carrying the payload, collapsed carrying the word, and no outcome at all. Measured: collapsing is nearly free (~2 instantiations per scope) and its real price is that `ResultOf` stops being the domain type; a TRANSPARENT core is where the saving is (−36 per scope, nine runtime values down to one), it keeps the supply gate without a brand, and it charges the WRAP shape instead. Also that enumerating a scope's refusals needs none of them — it is one exported alias in every design | the scope outcome on #30; decision 42 cites it throughout | **FIRED** — §42, the outcome left the core. Kept as the prior art it was decided on |
| [`parameterised-builder/`](./parameterised-builder/) | that carrying the builder's state in a type PARAMETER rather than in phantoms read through `Self` costs LESS (measured: −54 instantiations per scope, −11 per step, types −16%) — which makes the scope callable from the first line, lets `R` accumulate as a union, and removes the termination declaration entirely | the scope builder on #30; `scope.ts` cites it for the number | **FIRED** — the builder carries its state in a type PARAMETER, which is this prototype's answer. Kept as the prior art that decided it |
