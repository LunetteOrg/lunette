// The smallest scope runtime that can answer ONE question: can the builder be
// closed by a STEP, instead of by a separate `.handle` verb?
//
// Everything not needed for that question is left out — no carriers, no
// channels, no capabilities, no intents, no schemas. What is here is the step
// primitive, a builder with `.step()` and nothing else, and the two shapes of
// step that matter: one that continues, one that closes.

export interface Outcome<R> {
  readonly ok: boolean
  readonly value: R
  readonly error?: string
}

export type Next = (delta: object) => Promise<Outcome<unknown>>
export type Step = (app: object, ctx: object, next: Next) => Promise<Outcome<unknown>>

// THE MOVE. TypeScript cannot see that a function never calls `next` — that is
// runtime behaviour. But it can read a DECLARATION, which is what every other
// axis in the real design already does (a capability, an admission and an
// intent are all declared, never inferred from behaviour).
//
// So a terminal step says so in its type: `R` is what the fold ends up with,
// `Need` is what its leaf declared it needs from the app.
export interface Terminal<R, Need extends object> {
  readonly __closes?: (n: Need) => R
}

// Phantom accumulators, cut down to the two axes this question needs.
type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type NeedOf<T> = T extends { readonly __need?: infer N } ? (N extends object ? N : {}) : {}

export type Ctx<Self> = AccOf<Self>

// The closed form: a scope IS the function that runs it.
export interface Handler<Need extends object, R> {
  (app: Need): Promise<Outcome<R>>
  readonly steps: readonly Step[]
  readonly __need?: (n: Need) => void
}

// The builder, with ONE verb. `.step()` returns a `Handler` when what it was
// given declares that it closes, and the builder itself otherwise — so the
// transition from "still building" to "runnable" rides the argument's type.
export interface Scope {
  readonly __acc?: object
  readonly __need?: object

  step<S extends Step, Self = this>(
    this: Self,
    s: S,
  ): S extends Terminal<infer R, infer N>
    ? Handler<NeedOf<Self> & N, Awaited<R>>
    : Self
}

// ── the two step shapes ──────────────────────────────────────────────────────

// Continues: reads the ctx, hands an enrichment inward. This is what a guard
// and a channel both are, once the sugar is stripped off.
export const enrich =
  <D extends object>(f: (app: object, ctx: object) => D | Promise<D>): Step =>
  async (app, ctx, next) =>
    next(await f(app, ctx))

// Continues CONDITIONALLY: an authorization is the ordinary case — it either
// hands the caller's identity inward, or stops with an error. It is the third
// shape, and the one that shows the declaration is not redundant: it can end
// the fold at runtime, yet it must NOT close the builder, because the leaf has
// not been written yet. Behaviour and closure are different claims, and only
// the second is declared.
export const authorize =
  <D extends object>(f: (app: object, ctx: object) => D | false): Step =>
  async (app, ctx, next) => {
    const allowed = f(app, ctx)
    if (allowed === false) return { ok: false, value: undefined, error: 'denied' }
    return next(allowed)
  }

// Closes: never calls `next`, and SAYS SO in its type. That declaration is the
// whole of the experiment.
export const leaf = <Need extends object, R>(
  f: (app: Need, ctx: object) => R,
): Step & Terminal<R, Need> => {
  const step: Step = async (app, ctx, _next) => ({ ok: true, value: await f(app as Need, ctx) })
  return step as Step & Terminal<R, Need>
}

// ── the runtime ──────────────────────────────────────────────────────────────

async function runSteps(steps: readonly Step[], app: object): Promise<Outcome<unknown>> {
  const at = async (i: number, ctx: object): Promise<Outcome<unknown>> => {
    const step = steps[i]
    if (step === undefined) {
      // Unreachable through the API: the only way to get a callable is to have
      // added a terminal step, and a terminal step never calls `next`.
      throw new Error('research: a stack with no terminal step')
    }
    return step(app, ctx, (delta) => at(i + 1, { ...ctx, ...delta }))
  }
  return at(0, {})
}

type Surface = Record<string, unknown>

function make(steps: readonly Step[]): Surface {
  return {
    step(s: Step & Terminal<unknown, object>) {
      const next = [...steps, s]
      // The runtime CANNOT tell the two apart, and does not need to: it returns
      // both faces at once — an object carrying `.step` that is also callable.
      // Only the TYPE picks one, from the declaration on the argument. That
      // asymmetry is the finding, and it is worth naming: the runtime is
      // uniform, the type is not.
      const run = (app: object) => runSteps(next, app)
      return Object.assign(run, make(next), { steps: next })
    },
  }
}

export const scope = (): Scope => make([]) as unknown as Scope
