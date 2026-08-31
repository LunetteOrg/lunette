import { isAbort, isOk, type Abort, type Ok } from './abort.ts'
import type { Outcome } from './carrier.ts'

// THE PRIMITIVE, and its composition. One mechanism: an ordered stack of steps
// around a leaf, each free to enrich the ctx, stop, or act on the way back out.
// The verbs a user writes are sugar over this and live in `steps.ts`.

// What a step calls to continue inward. The delta is merged into the ctx the
// remaining steps and the leaf will read.
export type Next = (delta: object) => Promise<Outcome<unknown, object>>

// A STEP wraps the rest of the fold. Because it wraps `next` it also has an
// AFTER — where a span is closed or a sink's contents attached — which a
// pre-hook plus a collector could not express (#55).
//
// §33 says an onion cannot carry a RETURNED abort, and that stands for the verb
// it was written about: a guard's author must not have to call `next`. It does
// not stand for the mechanism — `guardStep` is where that call lives, so the
// author never sees it.
export type Step = ((app: object, ctx: object, next: Next) => Promise<Outcome<unknown, object>>) & {
  // What this step wants recorded on the built `Handler`, under its own keys.
  // The core never reads what is in here — it is a registry, not a schema map:
  // the validation extension writes Standard Schemas into it and a host mount
  // reads them back for its native validator (`sValidator('param', …)`), and
  // the core knows neither of those facts.
  readonly registers?: Readonly<Record<string, unknown>>
}

// The base outcome a leaf produces. An `Ok` carries its own success intent
// (`json(v, 201)`); anything else is a plain domain value. The fold never reads
// what an intent MEANS, only whether the brand is there.
export async function runLeaf(
  leaf: (deps: object, ctx: object) => unknown,
  app: object,
  ctx: object,
): Promise<Outcome<unknown, object>> {
  const result = await leaf(app, ctx)
  if (isAbort(result)) return { ok: false, abort: result as Abort<never>, effects: {} }
  if (isOk(result)) {
    const ok = result as Ok<unknown, never>
    return { ok: true, value: ok.value, intent: ok.intent, effects: {} }
  }
  return { ok: true, value: result, intent: undefined, effects: {} }
}

// Compose the stack. Each step receives the ctx as it stands and a `next` that
// continues inward with its delta merged in; the leaf sits at the centre.
// The stack ends by itself: the LEAF is a step like any other, the one that
// does not call `next`. So there is no `leaf` parameter and no separate phase —
// `.handle` pushes it and closes the builder, which is the only way to reach a
// runnable scope. Running past the end is therefore unreachable through the API;
// if it happens, something assembled a stack by hand and left the leaf out,
// which is a construction bug and says so.
//
// `async` on both, and that is a contract and not a style: a step may throw
// SYNCHRONOUSLY (a construction bug says so by throwing — infrastructure, by the
// error convention), and a plain function would let that escape past the promise
// the callable promises to return. A caller reaching for `.catch()` instead of
// `await` would then miss it entirely.
export async function runSteps(
  steps: readonly Step[],
  app: object,
  seed: object,
): Promise<Outcome<unknown, object>> {
  const at = async (i: number, ctx: object): Promise<Outcome<unknown, object>> => {
    const step = steps[i]
    if (step === undefined) {
      throw new Error('@lntt/scope: a step stack with no leaf — `.handle()` was never called')
    }
    return step(app, ctx, (delta) => at(i + 1, { ...ctx, ...delta }))
  }
  return at(0, seed)
}
