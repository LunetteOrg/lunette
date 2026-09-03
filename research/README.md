# research

Live research prototypes — evidence, not products. Every tenant has a
stated purpose and a RETIREMENT CONDITION; when the condition fires and
nothing references the prototype anymore, it gets deleted.

A FIRED condition is not on its own a reason to delete: three of the four below
are cited from `docs/` or from a comment in `packages/`, and a prototype that a
decision rests on is the evidence for that decision. They go when the citation
goes.

Each retirement is now tracked by its own cleanup issue — the table's "retires
when" column and the issue say the same thing; the issue is where it actually
gets closed out.

| prototype | what it proves | referenced by | retires when | cleanup issue |
|---|---|---|---|---|
| [`order-free-layers/`](./order-free-layers/) | prior art: order independence via runtime `requires` keys, and why it was not chosen | decision 1; parallel-boot issue #16 | issue #16 closes, either way | #79 |
| [`terminal-step/`](./terminal-step/) | that a step declaring it TERMINATES can close the builder on its own, so `.handle` is sugar rather than a second mechanism — and what that costs (measured: constant per scope, not per step) | the scope builder on #30 | superseded: the builder needs no closing at all, see below. Kept as the prior art that answer was reached through | #80 |
| [`collapsed-outcome/`](./collapsed-outcome/) | what the scope's OUTCOME costs in four shapes — two branches (today), collapsed carrying the payload, collapsed carrying the word, and no outcome at all. Measured: collapsing is nearly free (~2 instantiations per scope) and its real price is that `ResultOf` stops being the domain type; a TRANSPARENT core is where the saving is (−36 per scope, nine runtime values down to one), it keeps the supply gate without a brand, and it charges the WRAP shape instead. Also that enumerating a scope's refusals needs none of them — it is one exported alias in every design | the scope outcome on #30; decision 42 cites it throughout | **FIRED** — §42, the outcome left the core. Kept as the prior art it was decided on | #81 |
| [`parameterised-builder/`](./parameterised-builder/) | that carrying the builder's state in a type PARAMETER rather than in phantoms read through `Self` costs LESS (measured: −54 instantiations per scope, −11 per step, types −16%) — which makes the scope callable from the first line, lets `R` accumulate as a union, and removes the termination declaration entirely | the scope builder on #30; `scope.ts` cites it for the number | **FIRED** — the builder carries its state in a type PARAMETER, which is this prototype's answer. Kept as the prior art that decided it | #82 |
| [`no-scope-hosts/`](./no-scope-hosts/) | the same wire chain on Hono, Express, tRPC and React Router with NO scope at all, handlers written the way an app author actually would — what each host needs, what is duplicated four times, which mistakes are SILENT, and which of scope's current pieces answer one of them | issue #76 (closed via PR #78), which blocked #60's carriers | #76 has closed, but its findings are not yet folded into `docs/design/scope-api.md` or a decision — the roadmap (#60/#64/#67) was updated, the docs were not | #83 |
| [`with-scope-hosts/`](./with-scope-hosts/) | the same routes composed with `.step()` on the stripped-down (vocabulary-free) core, on all four hosts, each answering in its own native idiom — the reference shape for #60's carrier packages | #76 (closed); #60, which cites it directly as the form to extract | #60 ships `@lntt/scope/express`, `/hono`, `/trpc`, `/react-router` as real packages reproducing this shape | #84 |
