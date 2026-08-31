import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Ctx, State, Surface } from '../scope.ts'
import { invalid, type AnyStep, type Extension, type Next, type Outcome } from '../step.ts'

// VALIDATION, as an extension — `@lntt/scope/standard-schema`. It is the first
// one, and the one that shows what an extension IS: it contributes a VERB and
// does no fold work of its own. Adding it pushes nothing; calling `.validate`
// pushes the step.
//
// It is CARRIER-FREE, and deliberately: running a schema over a value asks
// nothing of the transport, so it composes on a bare `scope()` and on every
// carrier alike. That keeps the split the rest of the design makes — the core
// owns the MECHANISM and never the ALPHABET. It coins no word (§40), it names
// no capability (§34), and now it runs no schema engine either: a codebase that
// validates with something else ships its own extension with its own verb.
//
// What the CORE keeps is which entries exist. What a scope HAS is what the
// carrier and the steps before put there, and only the builder knows that set;
// this extension knows how to run a schema over one of them, and nothing more.

// ── what a scope may validate ────────────────────────────────────────────────
// The parameter's type is the UNION of the entries this scope holds, so an
// editor completes it and a typo is told what it could have written. A brand on
// the argument would type the parameter `string` and lose completion, which is
// why the gate idiom is the wrong tool here.
//
// The one case a union cannot express is the EMPTY one, where it degrades to
// `never` and names nothing — so a sentence stands in there. The tuple wrap is
// not decoration: `keyof … extends never` distributes over a non-empty union
// and is vacuously true for it (§3).
type Nameable<S extends State> = keyof Ctx<S> & string

export type Validatable<S extends State> = [Nameable<S>] extends [never]
  ? '⛔ this scope has nothing to validate — did you give it a carrier?'
  : Nameable<S>

// ── what validating does to the ctx ──────────────────────────────────────────
// It REPLACES the entry, and replacing is why an extension writes its own state
// transformation rather than handing the builder a delta to intersect: `Add`
// would intersect, and the ordinary refinement — a query string's
// `string | string[]` narrowed to `number` — intersects to `never`. A field
// nobody can use, and no error anywhere (§9). `Omit` first, then add back.
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
// DECLARED, not computed from the factory, and the reason is measured: `infer`
// through a generic factory instantiates its type parameters to their
// constraints, so a computed `validate` would lose BOTH the entry's name and
// the schema's output type — which is the whole of what it does.
//
// `this: Surface<S>` is how it reads the scope it was called on. That works
// because this is a METHOD call; on the scope's own call signature `this` binds
// to `void`, which is why the state lives in a type parameter at all.
//
// The schema is NOT constrained against the entry's raw type, and cannot be:
// measured against real zod, `Raw extends InferInput<S>` rejects every schema
// including the valid ones, and the reverse rejects
// `z.object({ page: z.coerce.number() })` — the most ordinary query schema
// there is, because `z.coerce.number()` reports its input as `number`, exactly
// as a schema that genuinely mishandles a query string does. The two are
// indistinguishable on the input face, and rejecting a valid declaration is
// worse than catching nothing. A wrong schema is a runtime `invalid` branch,
// which is not silent.
export interface Validate {
  validate<S extends State, N extends Validatable<S> & string, Sch extends StandardSchemaV1>(
    this: Surface<S>,
    name: N,
    schema: Sch,
  ): Surface<Refined<S, N, StandardSchemaV1.InferOutput<Sch>>>
}

// ── the step the verb pushes ─────────────────────────────────────────────────
// Read the entry as it stands — put there by the carrier or by an earlier
// step — and REPLACE it with the schema's output, or stop on the core's own
// `invalid` branch. This is the whole of "steps populate, validate refines",
// and it is why nothing else needs to know a schema exists.
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

// The value. `methods` is tied to `Validate` BY NAME, so a verb declared with
// no factory, or a factory no verb declares, is a compile error here rather
// than a surprise at the call site — which is the half of the duplication that
// can be closed.
export const standardSchema: Extension<Validate> = {
  methods: { validate: validateStep as unknown as (...args: never[]) => AnyStep },
}
