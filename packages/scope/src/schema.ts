import type { StandardSchemaV1 } from '@standard-schema/spec'

// The two projections of a scope's input contract. A Standard Schema
// (standardschema.dev v1 — zod 3.24+, Valibot, ArkType all implement it) has
// two type faces: what the host hands in (raw, pre-coercion) and what the
// guards + leaf read (coerced, validated). `InputOf` is the shape a host route
// must provide; `OutputOf` is the params type explicit on OUR side.
export type InputOf<S extends StandardSchemaV1> = StandardSchemaV1.InferInput<S>
export type OutputOf<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>
