import type { RequestHead } from './carrier.ts'
import type { ScopeExtension, ScopeExtensionValue } from './scope.ts'

// The `request` extension — a tree-shakable subpath (`@lntt/scope/request`).
// It is READ-ONLY: injecting it (`scope().extend(request)`) adds `ctx.request`
// (the headless `RequestHead` — url/method/headers, so a guard can read the
// session off the incoming `Cookie`/`Authorization` header) and NOTHING else. It
// carries NO capability, so a `request`-only scope mounts on EVERY HTTP host,
// tRPC included.
//
// The write-side channels are DELIBERATELY separate extensions, so a scope
// authored for tRPC never even sees them: `@lntt/scope/body` brings `.body`/
// `.form` (the `body` capability, absent on tRPC), `@lntt/scope/cookies` brings
// the `Set-Cookie` sink (the `cookies` capability, absent on tRPC). You can't
// misuse a channel a host lacks — the method simply isn't on the builder.
export interface RequestExtension extends ScopeExtension {
  readonly __ctx?: { readonly request: RequestHead }
}

// A read-only extension contributes no methods — it exists for its `__ctx`.
const requestRuntime: ScopeExtensionValue = {
  methods() {
    return {}
  },
}

export const request = requestRuntime as unknown as RequestExtension
