import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Ctx, State, Surface } from '../scope.ts'
import type { Extension } from '../scope.ts'
import { invalid, type AnyStep, type Next, type Outcome } from '../step.ts'

// VALIDATION, as an extension — `@lntt/scope/standard-schema`. The first one,
// and the one that shows what an extension IS: it contributes a VERB and does
// no fold work. Adding it pushes nothing; calling `.validate` pushes the step.
//
// CARRIER-FREE, deliberately: running a schema over a value asks nothing of the
// transport, so it composes on a bare `scope()` and on every carrier alike. It
// coins no word (§40) and names no capability (§34). What a scope HAS is what
// the carrier and the earlier steps put there; this knows how to run a schema
// over one of those entries, and nothing more.

// ── what a scope may validate ────────────────────────────────────────────────
// The UNION of the entries this scope holds, so an editor completes it and a
// typo is told what it could have written. The gate idiom is the wrong tool
// here: a brand would type the parameter `string` and lose completion.
//
// A union cannot express the EMPTY case, where it degrades to `never` and names
// nothing, so a sentence stands in. The tuple wrap is not decoration:
// `keyof … extends never` distributes over a non-empty union and is vacuously
// true for it (§3).
type Nameable<S extends State> = keyof Ctx<S> & string

export type Validatable<S extends State> = [Nameable<S>] extends [never]
  ? '⛔ this scope has nothing to validate — did you give it a carrier?'
  : Nameable<S>

// ── what validating does to the ctx ──────────────────────────────────────────
// It REPLACES the entry, which is why an extension writes its own state
// transformation rather than handing the builder a delta: `Add` would
// intersect, and narrowing a query string's `string | string[]` to `number`
// intersects to `never` — a field nobody can use, with no error (§9).
type Refined<S extends State, N extends string, T> = {
  need: S['need']
  args: S['args']
  acc: Omit<S['acc'], N> & { readonly [K in N]: T }
  result: S['result']
  intents: S['intents']
  vocabulary: S['vocabulary']
  verbs: S['verbs']
}

// ── the verb ─────────────────────────────────────────────────────────────────
// `this: Surface<S>` is how it reads the scope it was called on: `this` binds
// on a METHOD call, and on the scope's own call signature it binds to `void`.
//
// The schema is NOT constrained against the entry's raw type, and cannot be.
// Measured against real zod, `Raw extends InferInput<S>` rejects every schema
// including the valid ones, and the reverse rejects
// `z.object({ page: z.coerce.number() })` — the most ordinary query schema there
// is — because `z.coerce.number()` reports its input as `number`, exactly as a
// schema that genuinely mishandles a query string does. The two are
// indistinguishable on the input face, and rejecting a valid declaration is
// worse than catching nothing. A wrong schema is a runtime `invalid`, which is
// not silent.
export interface Validate {
  validate<S extends State, N extends Validatable<S> & string, Sch extends StandardSchemaV1>(
    this: Surface<S>,
    name: N,
    schema: Sch,
  ): Surface<Refined<S, N, StandardSchemaV1.InferOutput<Sch>>>
}

// ── the step the verb pushes ─────────────────────────────────────────────────
// Read the entry as it stands and REPLACE it with the schema's output, or stop
// on the core's own `invalid` branch. The whole of "steps populate, validate
// refines", and why nothing else needs to know a schema exists.
const validateStep =
  (name: string, schema: StandardSchemaV1) =>
  async (
    _app: {},
    ctx: Readonly<Record<string, unknown>>,
    next: Next<Record<string, unknown>>,
  ): Promise<Outcome<unknown>> => {
    // `~standard.validate` may be sync or async; awaiting covers both.
    const result = await schema['~standard'].validate(ctx[name])
    // No cast: the core writes its own `Issue`, and Standard Schema's is
    // structurally that — which is the whole point of the core not importing it.
    if (result.issues !== undefined) return invalid(result.issues)
    return next({ [name]: result.value })
  }

// `methods` is tied to `Validate` BY NAME, so a verb with no factory — or a
// factory no verb declares — is an error here rather than at the call site.
export const standardSchema: Extension<Validate> = {
  methods: { validate: validateStep as unknown as (...args: never[]) => AnyStep },
}
