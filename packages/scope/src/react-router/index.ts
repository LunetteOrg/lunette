// `@lntt/scope/react-router` — the React Router carrier and its two mounts.
//
// A carrier is `__args` alone (§43). A loader and an action carry the same
// `{ request, params }` pair, so ONE carrier serves both — but they are two
// DISTINCT mount shapes and never a generic middleware: each runs to
// completion on its own, once, for its own route. That is why there is no
// `mw` here.
//
// `context` — React Router's own per-request bag — is deliberately left out of
// `__args`: a mount adds it back at the specific type it actually receives, the
// same way an Express route reads `Request`/`Response` at the width it needs.

import type { Params } from 'react-router'

export interface ReactRouterCarrier {
  readonly __args?: { readonly request: Request; readonly params: Params }
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`.
export const reactRouterCarrier: ReactRouterCarrier = {}

// `loader` and `action` are the same wrapper twice, and stay two names on
// purpose: which one a route exports is what React Router reads, so collapsing
// them into one `mount` would hand the author a value that fits both slots and
// says nothing about which it is.
//
// A step that stops does so in React Router's own door — a THROWN `data(...)`
// or `redirect(...)`. A RETURNED `data(null, { status: 404 })` renders normally
// instead of reaching an ErrorBoundary, and nothing here guards against writing
// `return` by mistake: the mistake is at the call site, not at a missing check.
export const reactRouter = <App extends object>(deps: App) => ({
  loader:
    <Args extends { readonly request: Request; readonly params: Params }>(
      sc: (app: App, args: Args) => unknown,
    ) =>
    (args: Args) =>
      sc(deps, args),

  action:
    <Args extends { readonly request: Request; readonly params: Params }>(
      sc: (app: App, args: Args) => unknown,
    ) =>
    (args: Args) =>
      sc(deps, args),
})
