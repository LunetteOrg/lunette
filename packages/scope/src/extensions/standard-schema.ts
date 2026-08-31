import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Invalid, Issue } from '../carrier.ts'
import type { Next, Step } from '../fold.ts'
import type { Channel, Validatable } from '../scope.ts'
import type { InputOf, OutputOf } from '../schema.ts'

// VALIDATION, as a channel — `@lntt/scope/standard-schema`. It contributes one
// verb, `.validate(name, schema)`, which refines an entry the scope already has:
// same ctx key, narrower type.
//
// It is CARRIER-FREE (`__admission: {}`): running a schema over a value asks
// nothing of the transport, so it composes on `scope()` with no carrier and on
// every carrier there is. The core keeps `Validatable` — which entries EXIST is
// what the carrier and the channels populated, and the core knows that set —
// while this file knows only how to run a schema over one of them.
//
// Naming it for the ENGINE rather than the verb is the point: a codebase that
// validates with something else ships its own channel with its own `validate`,
// and the core stays out of it. `@standard-schema/spec` is the interface zod,
// Valibot and ArkType all implement, so this one covers them together.

// Running a Standard Schema over an opaque value is genuinely protocol-free,
// and a failure here is NOT an abort: an abort is a word from a carrier's
// vocabulary and this channel coins none. It reports the issues untouched, and
// deciding what they are worth on the wire (422, kept distinct from Hono's
// native `sValidator` 400) is the CODEC's choice (§40).
export async function validateInput<S extends StandardSchemaV1>(
  schema: S,
  raw: unknown,
): Promise<{ ok: true; value: OutputOf<S> } | { ok: false; issues: readonly Issue[] }> {
  // `validate` is `Result | Promise<Result>` — ALWAYS await (a sync implementer
  // returns a plain object, `await` passes it through unchanged).
  const parsed = await schema['~standard'].validate(raw)
  // FailureResult carries a truthy `issues`; SuccessResult's is `undefined` —
  // the tag the Standard-Schema interface guarantees.
  if (parsed.issues) return { ok: false, issues: parsed.issues }
  // `as` only at the erased validation boundary — the schema guarantees the shape.
  return { ok: true, value: parsed.value as OutputOf<S> }
}

// The step the verb pushes: read the entry as it stands — seeded by the host or
// populated by a channel — and REPLACE it with the schema's output, or
// short-circuit on the core's own `invalid` branch. It also REGISTERS the schema
// under the entry's name, which is how a mount reaches it for a native
// validator; the core merges `registers` without reading it.
const step = (name: string, schema: StandardSchemaV1): Step => {
  const run = async (_app: object, ctx: object, next: Next) => {
    const v = await validateInput(schema, (ctx as Record<string, unknown>)[name])
    if (!v.ok) return { ok: false as const, invalid: { issues: v.issues } satisfies Invalid, effects: {} }
    return next({ [name]: v.value })
  }
  return Object.assign(run, { registers: { [name]: schema } })
}

export interface StandardSchemaChannel extends Channel {
  // Nothing from the transport.
  readonly __admission: {}

  // The name is CONSTRAINED to the entries the scope has, so an editor
  // completes it and a typo is told what it could have written. The schema is
  // NOT constrained against the entry's raw type: both directions of that test
  // were measured against real zod and neither ships — one rejects every
  // schema, the other rejects `z.coerce.number()` over a query string, because
  // zod reports a coercing schema's `InferInput` as its OUTPUT type and so
  // cannot be told apart from the schema that genuinely mishandles the raw
  // value. Catching nothing beats rejecting a valid declaration.
  validate<N extends Validatable<Self>, X extends StandardSchemaV1, Self = this>(
    this: Self,
    name: N,
    schema: X,
  ): Self & {
    readonly __acc?: { readonly [K in N & string]: OutputOf<X> }
    readonly __registry?: { readonly [K in N & string]: X }
  }
}

export const standardSchema = {
  methods: { validate: step },
} as unknown as StandardSchemaChannel

// The two projections of a schema, re-exported HERE because a host mount needs
// them: `InputOf` is the shape a route must accept (what types `hc<AppType>()`),
// `OutputOf` is what a guard or a leaf reads. They travel with the engine, not
// with the core, which no longer names one.
export type { InputOf, OutputOf }
