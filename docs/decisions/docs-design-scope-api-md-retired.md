---
title: "`docs/design/scope-api.md` is retired; the traps and the numbers live in the code"
area: scope-runtime
status: accepted
---

# `docs/design/scope-api.md` is retired; the traps and the numbers live in the code

**Decision.** Delete the scope API design document. What it carried that
nothing else did — the traps that each cost a measurement, and the builder's
cost breakdown — is written at the line it constrains, across `index.ts`,
`route-gate.ts`, `guard/index.ts` and `express/index.ts`. Everything else it held has a
better home already: the contract is `packages/scope/README.md` and the code,
the rejected roads are this file, and the work order is the issue graph and the
project board — which is where `CLAUDE.md` says order lives, never in a file,
since a file is right only for whoever stands on the branch that last edited
it.

**Alternatives.** *Freeze it as an archive*, with a header saying it is
historical — rejected: 1156 lines of which half describe machinery that never
shipped stay in `docs/`, and someone reopens them believing it. *Rewrite it as
the contract it claims to be* — rejected: that is what `packages/scope/README.md`
now is, and a second document for the same audience is duplication that leaves
a reader guessing which of the two is current. *Move the residue into a new short document* — rejected on
measurement, below.

**Why.** It was doing four jobs and three had moved out from under it. Nine
inline "superseded / never shipped / retired" blocks had accumulated, and its
own header said most of what followed described the vocabulary design that was
tried and dropped. Identifiers the shipped code does not have: `Outcome`,
`__vocabulary`, `IntentsOf`, `Word`, `Capability`, `CarrierGuard`.

The cost was not the upkeep. `CLAUDE.md` said READ IT FIRST, so whoever obeyed
met a document that contradicted itself in its third line — and it manufactured
false positives: #38 and #44 read as live work purely because this document
still said `Capability`/`CarrierGuard` survive for the mount. They exist nowhere
under `packages/`.

**What the residue turned out to be, checked before deleting.** Of the eighteen
traps, most were already in the code, in the code's own words: the gate riding
the ARGUMENT, defaulted parameters on the ALIAS and an intersection that cannot
refine so `Ctx` uses `Omit` (all `index.ts`), vacuous truth on a param-less
pattern (`route-gate.ts`), an invariant phantom blocking inference, a state member
constrained to the wrong shape, `infer` through a generic factory instantiating
to constraints (`index.ts` and `guard/index.ts`), and reading-versus-parsing
failing for opposite reasons (`guard/index.ts`).

Three were still binding and written down nowhere, so they went into the source
where each one bites: an invariant type PARAMETER whose actual type is `never` not
extending `any` in a conditional position, on `LocalsOf` in `express/index.ts`;
why the chain gate carries a named member holding `Need` rather than a message
literal — a literal could not carry a type, and what the reader needs printed is
what the scope demands; and why intersecting a fresh call signature per step
does not rescue `this`, since two call signatures in an intersection become
overloads and the stale one resolves first.

The traps left behind are about machinery that is gone — intent inference, the
word mechanism, carrier-and-extension brands, a declaration read by value. That
is archaeology, and git keeps it.

The MEASURED section is the other half, and its numbers compare the shipped
shape against rejected ones — this record's job, not a comment's. They are all
below.

**The runtime numbers, and why they are here rather than on `runSteps`.** The
retired document also held a runtime table, and it is evidence against three
optimisations someone will propose again. Node, ns per run, warmed, comparisons
valid only within a run:

| run | | 5 steps | 20 steps | |
|---|---|---|---|---|
| 1 | continuation passing (shipped) | 749 | 4,670 | |
| 1 | composed once, memoised on first call | 700 | 4,522 | −6.5% / −3.2% |
| 2 | ctx merged by spread (shipped) | 1,251 | 6,213 | |
| 2 | ctx as a prototype chain | 3,193 | 12,336 | **+155%** |
| 2 | steps synchronous, no `await` per level | 649 | 3,580 | −48% |
| 3 | continuation passing (the baseline of its own run) | 810 | 4,626 | |
| 3 | generators + an interpreter | 2,210 | 10,637 | **+173%** |

Each run has its own baseline and only within-run comparisons hold: the
generators row is 2.7× the 810 above it, not the 749 at the top.

The whole fold is **1–6 µs** against an HTTP request of hundreds of µs to
milliseconds — under 1% — so pre-composing its closures buys 3–6% of something
that is not where the time goes. A prototype-chain ctx is **2.5× slower**, not
faster: the chain deepens per step and every read walks it, so the explicit
spread costs nothing and earns the isolation it is written for. Generators plus
an interpreter are **2.7×**, and that is with a simplified interpreter. The
−48% for synchronous steps is the price of `async` being the contract: a step
may throw synchronously, and a plain function would let that escape past the
promise the callable returns.

**Also inventoried, so it is not lost with the file.**

- **`scope(carrier)` against `.extend(carrier)`**: 636.7 versus 638.5
  instantiations per scope — **no type-level simplification at all**. What the
  constructor form buys is a category that cannot be confused and errors that
  land at the definition rather than at the mount, which is worth having and is
  not a performance argument.
- **The check for a step that returns nothing** cost +9.1% as a gate of its own
  and +7.1% merged with the word check that used to sit beside it, since both
  asked about the same `Awaited<Ret>`. With the word check gone `ReturnGate`
  stands alone, so the merged figure is history; what it bought is stated on
  the gate itself.
- **A verb's signature DECLARED against computed**, on a workload using no verb
  at all: 6,637 → 5,056 instantiations (**−23.8%**), types −19.8%. The computed
  machinery resolved on every `Surface<S>`, so every scope paid for it, verbs
  or not. That is the other half of the trap on `Extension`: `infer` through a
  generic factory instantiates to constraints, so the computed form was both
  slower and wrong.
- **Effect systems do not discover parallelism either.** `Effect.all([a, b])`
  is the same authored claim a `.parallel(a, b)` would be, and a program
  written in sequence stays sequential. What owning a scheduler buys is what
  happens on FAILURE: `Promise.all` rejects while the losing branch runs to
  completion, its errors unhandled and its resources unreleased, where an
  interpreter interrupts it and runs its finalizers. The axis is the quality of
  concurrency once asked for, never its discovery — the other half of the
  generators row above, aimed at the same proposal.
- **The machinery is nearly free to HAVE and paid per scope**: +0.8% at zero
  scopes, then 250 → 615 instantiations per scope, linearly, with no
  super-linear term. What a scope costs is what a scope costs; adding the
  package to a project that builds none costs nothing worth naming.
- **On the real `examples/app`**, both sides measured from a worktree at the
  pre-change commit: 207,153 → 222,755 instantiations (+7.5%), check 0.36s →
  0.41s. The method is the finding: **a figure read out of a file is not a
  measurement**. The stale number a table was carrying, read as the "before",
  turned +7.5% into a reported +65% — the same failure the `Grown` bullet below
  records from the other side.
- **The builder's state in a type PARAMETER against phantoms read through
  `Self`**: −8.3% and −5.2% instantiations on two workloads, types −15.8% and
  −16.9%, solving to ≈−54 per scope and −11 per step. Not repeated here because
  it is already where it constrains, on the state parameter in
  `packages/scope/src/index.ts`, with the workload in
  `research/parameterised-builder`.
- **`returns` as a raw union, projected at the readers, against extracting
  eagerly**: 24,349 → 24,057, a wash. Kept for the reason the numbers did not
  show: eager extraction is LOSSY, and a step that WRAPS — replacing what came
  back — was dropped from what the scope reported. The raw union keeps the
  material to narrow.
- **The rest of the cost breakdown** on that same 21-step fixture: the `returns`
  accumulation 6%, one whole member of `State` 1.3%, and `DepGuard` ~0 — it
  rides the call, not each step. The other half of "a new axis is affordable".
- **`.parallel(a, b)`, parked with its safety analysis done.** Two of the three
  conditions come free from the signature: children take no `next`, so wrapping
  is inexpressible, and both read `Ctx<S>`, so a cross-dependency between them
  is refused by contravariance. The third is the ctx-key collision (#51). No
  issue tracks the verb itself, and this is the analysis not to redo.
- **A lazy `ctx.body` getter was rejected**, not overlooked: an async accessor
  on a synchronous ctx is worse than the read it replaces, and it is the ambient
  magic the design refuses. The eager read is what makes "every step runs where
  it was written" observable.
- **Two gaps stay open and are worth naming**: the step primitive with the
  callable scope, and `validate`, were never measured against what they
  replaced. Both would have to be taken from a worktree at the pre-change
  commit, since a figure read out of a file is not a measurement.
- **Gating a schema against its entry's RAW type** was measured in both
  directions and neither ships, and the reason is worth keeping because it is
  not "we did not get to it". Re-measured here on zod 4.5.4, the version this
  workspace resolves (the package declares the range `^4.5.4`), over `Query = Record<string, string | string[]>`:

  `Raw extends InferInput<S>` rejects every keyed object schema, including
  `z.object({ page: z.string() })`, which is a valid declaration over a query
  string. The reverse, `InferInput<S> extends Raw`, rejects
  `z.object({ page: z.coerce.number() })` — the most ordinary query schema
  there is — because zod 4 erases a coercing schema's input to `unknown`, and
  `{ page: unknown }` is not assignable to the raw entry.

  The erasure is what defeats both, since neither reads the input face as
  anything but a whole: the coercing schema's `{ page: unknown }` is too loose
  for one direction and not assignable for the other. Since rejecting a valid
  declaration is worse than catching nothing, neither ships.

  What is NOT claimed here is impossibility. A per-KEY rule exempting the
  positions zod erased — `IsUnknown<I[K]> extends true ? true : I[K] extends
  Raw[K]` — accepts the coercing schema, accepts `z.string()`, and rejects the
  mistaken `z.number()`: measured, on those same three schemas. It is a
  traversal rather than one `extends`, and what it really says is "wherever zod
  erased, anything goes", which is most of a query schema. It is written down so
  the next attempt starts here rather than at the two directions that do not
  work. A check reading the schema's OUTPUT, or one a schema opts into, is the
  other road; both need a real case.

  The consequence, measured on the shipped mounts: a coercing schema compiles
  and its leaf reads a real `number` (`?page=3` arrives as `3`), and the
  mistaken `z.number()` over the same entry compiles too and answers 422
  through the author's own `onError`, saying `expected number, received
  string`. No false rejection, and the error names itself on the first
  request.

**The type-level numbers.** The first is re-measured on the shipped package,
against a baseline of 329,128 instantiations and 112,033 types
(`tsc --extendedDiagnostics` over `@lntt/scope`). The second is quoted from the
retired document, on the 21-step fixture it names, whose own baseline was
24,349:

- **DRYing `Grown`.** Rebuilding the state through `Omit<S, keyof P> & P` so it
  names only the members that change: 363,347 instantiations (**+10.4%**) and
  118,247 types (**+5.5%**). The repetition is the optimisation, and it is the
  same intersection cost the state parameter avoids, arriving from the other
  side. The retired document put this at +47% on a 21-step fixture that still
  carried the word check — which is why the code now states the constraint and
  leaves the number here: a figure measured on a shape that no longer exists
  reproduces as something else.
- **Where the builder's cost is**, on that same fixture: `Ctx`'s `Omit` 16% and
  `Surface`'s intersection 15% of a chain's instantiations, against ~9% for all
  of `State`'s members together — so a new axis is affordable and neither
  derived type is reducible. The `Surface` half has a trap with it, and that one
  IS in the code: skipping the intersection while `verbs` is empty breaks the
  inference of `S` through `this`.

**What this does not touch.** `docs/design/scope-runtime.md` stays: it is an
open design exploration with the performance record two spikes cite by name.
