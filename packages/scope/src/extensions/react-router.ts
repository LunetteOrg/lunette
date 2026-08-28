import { data, redirect } from 'react-router'
import type { RequestHead } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue } from '../scope.ts'

// THE REACT ROUTER CARRIER. Unlike `http`/`trpc`, it coins no Abort/Ok
// vocabulary of its own: a scope mounted on RR7 still extends
// `@lntt/scope/http` for the returned-Abort side, and `@lntt/integration/
// react-router`'s codec reads the SAME `HttpIntent` shape http's other hosts
// do, translating it into RR7's own idiom (a redirect intent → RR7's
// `redirect()`, a status intent → a thrown `data()`). What is RR7-specific
// is the ESCAPE HATCH §33 already amends for: a leaf MAY speak RR7 directly —
// `return data(v, {status})`, or `throw redirect(...)` — bypassing the
// Abort/Ok convention entirely (the leaf's return type is RR7's own value,
// not ours), which is a deliberate, unportable choice a single-host app can
// make. `data`/`redirect` are re-exported here rather than imported from
// `'react-router'` at the call site, so that choice is still made through
// this carrier's own subpath, the way every other carrier's vocabulary is.
export interface ReactRouterExtension extends ScopeExtension {
  readonly __ctx?: { readonly request: RequestHead }
}

// Read-only, like `request.ts`: this extension exists for `ctx.request` (a
// scope that ONLY uses the `data()`/thrown-`redirect()` escape hatch needs
// no other carrier) and for re-exporting RR7's own verbs. It contributes no
// method of its own.
const runtime: ScopeExtensionValue = {
  methods() {
    return {}
  },
}

export const reactRouter = runtime as unknown as ReactRouterExtension

export { data, redirect }
