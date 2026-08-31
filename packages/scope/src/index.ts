// The host-agnostic scope core. `scope()` is the carrier-agnostic base —
// nothing to read, no way to abort, and it mounts everywhere by construction;
// `scope(carrier)` brings a carrier's ctx, the entries it populates, and the
// words it coins. Carriers and channels live in tree-shakable subpaths and the
// core names none of them: `@lntt/scope/http` (`ctx.request`, `params`,
// `notFound`/`redirect`/…, `json`/`html`/`text`, `.status`), `.../trpc`
// (`ctx.request`, `input`, its own codes), `.../react-router` (HTTP's words
// re-exported plus `data()`, the word only a loader renders), `.../body`
// (`body('json'|'form')` → `ctx.body`), `.../query`, `.../request-cookies`,
// `.../request-headers` (the reads), `.../cookies`, `.../headers` (the writes,
// under `ctx.response`). This barrel carries the entry, the extension SPI, the
// carrier shapes, the fold, the schema projections, and the adapter brands.

export { scope } from './scope.ts'
export type {
  Scope,
  Carrier,
  Channel,
  ScopeExtension,
  ScopeExtensionValue,
  BuildState,
  Next,
  Step,
  Handler,
  Ctx,
  Validatable,
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
// No `runFold`/`runScope`, and no step factories either: a scope IS the function
// that runs it, so a host calls the scope. `guardStep`/`sinkStep`/`validateStep`
// are internal sugar (`steps.ts`) — the three shipped channels import them
// directly, and nobody outside has asked for one yet. A channel written
// elsewhere is not blocked: `Step` and `Sink` are public and a step can be
// written by hand. When a real case turns up (#55), exporting is one line;
// until then it would be API with no caller (principle 5).

export type { CarrierGuard, DepGuard, IntentGuard } from './adapter-guard.ts'
