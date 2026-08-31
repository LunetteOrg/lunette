# research: parameterised builder

**This is a research prototype, not a product.** It answers one question about
the scope builder in `@lntt/scope`, and retires when that question is settled.

## The question

The builder accumulates its state in PHANTOMS read back through `Self`, so every
verb returns `Self & <delta>`. That idiom exists so an extension's methods
survive: a verb added by `.extend` is still there after the next `.step`.

It has two consequences nobody chose:

- **The scope cannot be callable while it is a builder.** A call signature would
  have to read `Self`, and `this` binds to the receiver of a METHOD call —
  calling an object directly binds it to `void`. So `Need`, `Seed` and `R` are
  invisible to the call, and the builder has to become a CONCRETE type first.
  That transition is what a termination declaration (`{ run, closes: true }`)
  triggers, and it is the only reason the declaration exists — the fold sees
  termination perfectly well at runtime.
- **A union-valued axis cannot accumulate.** `Self & { r?: A } & { r?: B }` is
  `A & B`, so `R` collapses. The other union-valued axes get away with it by
  being maps of NAMES, where intersection does unite; `R` is a type, not a key.

**Does carrying the state in a type PARAMETER cost more?** If it does not, both
consequences go away: the scope is callable from the first line, `R` accumulates
as a real union, and the termination declaration is not needed at all.

## The answer: it costs LESS, on both axes

Two kernels, one workload generated from one template so the only difference is
which kernel it imports. 24 scopes, each with a carrier, enriching steps, a
guard that can stop with one of the carrier's words, and a leaf.
`tsc --extendedDiagnostics`, three runs, identical every time.

| workload | instantiations `Self &` | parameterised | delta |
|---|---|---|---|
| 2 fold steps + leaf | 24,941 | 22,871 | **−2,070 (−8.3%)** |
| 5 fold steps + leaf | 55,037 | 52,181 | **−2,856 (−5.2%)** |

Types: **−15.8%** and **−16.9%**. Check time is within noise at this size.

Solving the two rows for a per-scope and a per-step term gives **≈ −54 per
scope and ≈ −11 per step**: the parameterised form is cheaper in both
directions, and the advantage does not decay as scopes grow.

**The prediction was that it would cost more** — a state object rebuilt at every
`.step` against a phantom intersected once. It is the intersection that turns
out to be expensive: `Self` grows a new member per verb and every later read
(`NeedOf`, `AccOf`, `SeedOf`, …) walks all of them, while a parameterised read
is an indexed access into one object.

## What it does NOT model

Validation, extensions with their own methods beyond one verb, the mount gates,
and `Ctx`'s override rule beyond one level. Anything not needed to answer the
one question. The SHAPE of the cost is the transferable finding; the magnitude
on the real package has to be measured there.

## Retires when

`@lntt/scope`'s builder settles on one idiom or the other (#30). If it keeps the
`Self &` form, this records what that costs with a number rather than an
argument; if it moves, this is the prior art it moved on.

## Reproducing

```
pnpm --filter @lntt/research-parameterised-builder exec \
  tsc --noEmit -p tsconfig.self.json --extendedDiagnostics
```

and the same for `tsconfig.state.json`; `tsconfig.{self,state}-5.json` are the
larger workload the per-step term is solved from. The two workloads are
generated from one template — edit them in pairs, or the comparison stops
meaning anything.
