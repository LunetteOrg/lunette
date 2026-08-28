// The host-agnostic scope core. `scope()` is the carrier-agnostic base
// (`.guard`/`.handle`/`.extend`) — it has no input channel and no vocabulary
// to abort with until it extends a carrier; carrier capabilities AND carrier
// vocabularies live in tree-shakable subpaths, imported ONLY when needed —
// `@lntt/scope/http` (`.params`, `ctx.request`, `notFound`/`redirect`/…,
// `json`/`html`/`text`), `.../trpc` (`.input`, `ctx.request`, its own
// `notFound`/`unauthorized`/… rendered as tRPC codes), `.../react-router`
// (`ctx.request`, RR7's own `data`/`redirect` re-exported for a leaf that
// speaks RR7 directly), `.../body` (`.body`/`.form`), `.../cookies` (the
// Set-Cookie sink), `.../headers` (the response headers), `.../request`
// (read-only `ctx.request` with no capability). This barrel carries the
// entry, the extension SPI, the carrier shapes, the fold, the input schema
// projections, and the adapter brands.

export { scope } from './scope.ts'
export type {
  Scope,
  ScopeExtension,
  ScopeExtensionValue,
  Prepare,
  Sink,
  SinkFactory,
  Handler,
  Ctx,
  IntentKeysOf,
  IntentMap,
  ValueOf,
} from './scope.ts'
export type {
  Capability,
  Issue,
  Invalid,
  JobCarrier,
  Message,
  Outcome,
  RequestHead,
  RequestCarrier,
} from './carrier.ts'
export { isAbort, isOk } from './abort.ts'
export type { Abort, Ok, UnknownIntent } from './abort.ts'
export { runFold, runScope } from './run-fold.ts'
export { validateInput } from './validate.ts'
export { unit } from './schema.ts'
export type { InputOf, OutputOf, UnitSchema } from './schema.ts'
export type { CarrierGuard, DepGuard, IntentGuard } from './adapter-guard.ts'
