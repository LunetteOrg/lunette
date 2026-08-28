import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Issue } from './carrier.ts'
import type { OutputOf } from './schema.ts'

// Running a Standard Schema over an opaque `raw` value is genuinely
// protocol-free, so it stays in the core — but a failure here is NOT an
// abort. An abort is a word from a carrier's vocabulary, and the core coins
// none; minting a status code (as this used to, returning `httpError(422,
// …)`) would be exactly that. This returns the issues untouched; deciding
// what they are worth on the wire (422, kept distinct from Hono's native
// `sValidator` 400) is the CODEC's choice, made where `Outcome`'s `invalid`
// branch is rendered (`@lntt/scope/http`'s `toResponse`, once it exists).
//
// Consumed by the hosts WITHOUT a native validator (RR7, Express, bus) via
// `runScope`. Hono and tRPC validate natively with the SAME schema, so they
// skip this and pass already-parsed params.
export async function validateInput<S extends StandardSchemaV1>(
  schema: S,
  raw: unknown,
): Promise<{ ok: true; params: OutputOf<S> } | { ok: false; issues: readonly Issue[] }> {
  // `validate` is `Result | Promise<Result>` — ALWAYS await (a sync implementer
  // returns a plain object, `await` passes it through unchanged).
  const parsed = await schema['~standard'].validate(raw)
  if (parsed.issues) {
    // FailureResult carries a truthy `issues`; SuccessResult's `issues` is
    // `undefined` (falsy) — the tag the Standard-Schema interface guarantees.
    return { ok: false, issues: parsed.issues }
  }
  // `as` only at the erased validation boundary — the schema guarantees the shape.
  return { ok: true, params: parsed.value as OutputOf<S> }
}
