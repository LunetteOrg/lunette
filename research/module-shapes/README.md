# module-shapes — authoring shapes for feature modules

Research exploration, **not a product**. The bootstrap-replica (story 1)
writes feature modules in one shape — a single `expose` whose callback
renames deps per `bind` block. This package prices the alternatives on a
mini-domain that keeps the real stressors (repos behind interfaces, an
injected render function, one leaf-into-leaf composition edge), with the
**ctx-aligned leaf style** as the common ground: every leaf names its deps
as the chain keys that provide them (`Pick`-narrowed), so records bind
point-free.

## The specimens

| file | shape |
|---|---|
| `src/code-oriented.ts` | **control** — the replica's style: one `expose`, a local const for the composition stage, explicit deps slice per `bind` |
| `src/fluent.ts` | one chain step per wiring statement; `expose(fn)` puts each bound record in Ctx AND Pub, so composition is the ORDER of steps; namespace via `.as('threads')` |
| `src/fragment-per-leaf.ts` | one use case as its own mountable fragment (the extreme) |
| `src/window-step.ts` | the transaction window provided once as a NAMED step (`ctx.publishWindow`), leaves bound to it on the expose line |

`src/parity.test.ts` proves control and fluent interchangeable (same
surface, same behaviour). All runtime + type tests green; whole package
checks in ~0.10s (15,854 instantiations), noise-level.

## Findings

- **The fluent shape works and costs nothing.** With ctx-aligned leaves,
  the 25-line control collapses to four chain steps that read as
  sentences ("expose the authors, expose the writes, expose the reads").
  The composition edge (bound `getAuthor` feeding `getPostForReading`)
  becomes step order instead of a local const. Same Pub, same runtime
  behaviour (`parity.test.ts`).
- **The helper graduated into the core.** This package first trialled a
  userland `leaves()` (point-free record binding); the question it raised
  ("why is this not just `bind`?") was answered by decision 27: `bind`
  became single-arity — `bind(record)` returns the binder, application
  ties fixed deps, `.with(window)` ties them per call — so the fluent
  specimen now uses the core verb directly. DX caveat unchanged: a
  missing dep at an `expose` produces a TS2769 overload wall whose
  *final* line is exactly right ("missing the following properties …:
  render, getAuthor") — usable, not beautiful.
- **Per-leaf fragments price out as ceremony.** The Seed-as-contract and
  the standalone `run(fakes, …)` are genuinely nice (every dep is a seed:
  the deep-substitution question dissolves), but the host pays one mount
  per leaf and the onion machinery wraps a function that has no
  lifecycle. Verdict unchanged: fragment when the module OWNS resources
  or wiring complexity, plain `bind` when it is pure logic.
- **The window as a named step reads best of all.** `provide('publishWindow',
  …window(…))` turns transactionality into one self-describing line, and
  the expose line binds to `ctx.publishWindow` like any other value. The
  error convention holds against the in-memory tx: returned domain error →
  the prior insert commits; thrown infra error → the window's inserts
  vanish; windows are per call (a failed call does not poison the next).

## Run

```sh
pnpm --filter @lntt/research-module-shapes test        # runtime + *.test-d.ts
pnpm --filter @lntt/research-module-shapes typecheck   # tsc --noEmit
```
