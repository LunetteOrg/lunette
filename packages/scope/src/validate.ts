import type { StandardSchemaV1 } from '@standard-schema/spec'
import { type Abort, httpError } from './abort.ts'
import type { OutputOf } from './schema.ts'

// Client-side input failure is a DOMAIN error (the error convention): a
// RETURNED abort, never a throw. A URL/param that will not coerce is a client
// mistake (4xx), not an infrastructure fault (5xx). Status 422 (not 400) keeps
// Hono's RPC response union unambiguous vs `sValidator`'s own native 400
// (`packages/integration/src/hono.ts`) — domain guards should likewise avoid 400.
//
// Consumed by the hosts WITHOUT a native validator (RR7, Express, bus) via
// `runScope`. Hono and tRPC validate natively with the SAME schema, so they
// skip this and pass already-parsed params.
export async function validateInput<S extends StandardSchemaV1>(
  schema: S,
  raw: unknown,
): Promise<{ ok: true; params: OutputOf<S> } | { ok: false; abort: Abort }> {
  // `validate` is `Result | Promise<Result>` — ALWAYS await (a sync implementer
  // returns a plain object, `await` passes it through unchanged).
  const parsed = await schema['~standard'].validate(raw)
  if (parsed.issues) {
    // FailureResult carries a truthy `issues`; SuccessResult's `issues` is
    // `undefined` (falsy) — the tag the Standard-Schema interface guarantees.
    return { ok: false, abort: httpError(422, { issues: parsed.issues }) }
  }
  // `as` only at the erased validation boundary — the schema guarantees the shape.
  return { ok: true, params: parsed.value as OutputOf<S> }
}
