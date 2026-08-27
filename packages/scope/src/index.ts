// The host-agnostic scope core. `scope()` is the carrier-agnostic base
// (`.input`/`.guard`/`.handle`); carrier capabilities live in tree-shakable
// subpaths, imported ONLY when needed — `@lntt/scope/request` (`ctx.request`),
// `.../body` (`.body`/`.form`), `.../cookies` (the Set-Cookie sink), `.../headers`
// (the response headers). This barrel carries the
// entry, the extension SPI, the carrier shapes, the fold, the input schema
// projections, and the adapter brand.

export { scope } from './scope.ts'
export type {
  Scope,
  ScopeExtension,
  ScopeExtensionValue,
  Prepare,
  Sink,
  SinkFactory,
  Handler,
} from './scope.ts'
export type {
  Capability,
  JobCarrier,
  Message,
  Outcome,
  RequestHead,
  RequestCarrier,
} from './carrier.ts'
export { forbidden, httpError, isAbort, notFound, redirect, unauthorized } from './abort.ts'
export type { Abort, ResponseIntent } from './abort.ts'
export { runFold, runScope } from './run-fold.ts'
export { validateInput } from './validate.ts'
export { unit } from './schema.ts'
export type { InputOf, OutputOf, UnitSchema } from './schema.ts'
export type { CarrierGuard, DepGuard } from './adapter-guard.ts'
