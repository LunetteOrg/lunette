import { isAbort, type Abort } from './abort.ts'
import type { Issue } from './carrier.ts'
import { runLeaf, type Step } from './fold.ts'

// The two shapes the CORE turns into steps, and nothing else. Each is the
// single place `next` is called for that shape, which is why neither author
// upstream ever sees it: a guard is written `(deps, ctx) => enrichment | Abort`,
// a validate is a name and a schema.
//
// There is no `sinkStep` here. A channel that writes something writes its own
// step — open the collector, hand its surface inward, attach what it collected
// on the way out — which is the same length as declaring a `Sink` was, and it
// spares the SPI a shape whose only purpose was a loop the step primitive
// removed.

// A GUARD as a step: the author writes `(deps, ctx) => enrichment | Abort` and
// never learns that `next` exists, which is what lets the onion carry a
// returned abort after all (§33's objection is about the author, not the
// mechanism).
export const guardStep =
  (g: (deps: object, ctx: object) => unknown): Step =>
  async (app, ctx, next) => {
    const out = await g(app, ctx)
    if (isAbort(out)) return { ok: false, abort: out as Abort<never>, effects: {} }
    return next((out ?? {}) as object)
  }

// A VALIDATE as a step: read the entry as it stands — seeded by the host or
// populated by a channel — and REPLACE it with the schema's output, or
// short-circuit on the core's own `invalid` branch. This is the whole of
// "extensions populate, validate refines", and it is why no channel needs to
// know a schema exists.
export const validateStep =
  (
    name: string,
    validate: (
      raw: unknown,
    ) => Promise<{ ok: true; value: unknown } | { ok: false; issues: readonly Issue[] }>,
  ): Step =>
  async (_app, ctx, next) => {
    const v = await validate((ctx as Record<string, unknown>)[name])
    if (!v.ok) return { ok: false, invalid: { issues: v.issues }, effects: {} }
    return next({ [name]: v.value })
  }

// The LEAF as a step: the one that does not call `next`. Nothing about it is a
// special phase — it is the innermost link, and being innermost is the whole of
// what makes it the leaf.
export const leafStep =
  (leaf: (deps: object, ctx: object) => unknown): Step =>
  (app, ctx, _next) =>
    runLeaf(leaf, app, ctx)
