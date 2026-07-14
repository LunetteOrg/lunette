// The barrel over the feature-oriented `handlers/` directory. The scope runtime
// ships as @lntt/scope (host-agnostic) plus @lntt/integration (per-host
// adapters). This example exposes its use cases as fragments; the per-host
// wiring (build-once + mount + to*) lives in the separate entry packages (e.g.
// examples/rr7), which import these fragments unchanged. A file `handlers.ts`
// and a sibling directory `handlers/` coexist, so this import path stays put.
export * from './handlers/threads.ts'
export * from './handlers/profile.ts'
export * from './handlers/auth.ts'
