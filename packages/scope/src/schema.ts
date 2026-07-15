import type { StandardSchemaV1 } from '@standard-schema/spec'

// The two projections of a scope's input contract. A Standard Schema
// (standardschema.dev v1 — zod 3.24+, Valibot, ArkType all implement it) has
// two type faces: what the host hands in (raw, pre-coercion) and what the
// guards + leaf read (coerced, validated). `InputOf` is the shape a host route
// must provide; `OutputOf` is the params type explicit on OUR side.
export type InputOf<S extends StandardSchemaV1> = StandardSchemaV1.InferInput<S>
export type OutputOf<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>

// The param-less default: a trivial Standard Schema whose output is `{}`. A
// scope that never calls `.input` runs with `P = {}`, and host packs still
// get a real schema object to (harmlessly) hand their native validator for
// param-less routes — one code path, no special-casing.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type UnitSchema = StandardSchemaV1<{}, {}>

export const unit: UnitSchema = {
  '~standard': {
    version: 1,
    vendor: 'lntt',
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    validate: (value) => ({ value: (value ?? {}) as {} }),
  },
}
