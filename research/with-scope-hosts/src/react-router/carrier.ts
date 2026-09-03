import type { Params } from 'react-router'

// A loader and an action are two DISTINCT mount shapes, never a generic
// middleware — but both carry the same `{ request, params }` pair, so one
// carrier serves both. `context` (React Router's own per-request bag) is
// left out: nothing here reaches for it, and the two verbs below add it
// back at the specific type each mount actually receives, the same way
// Express's Request/Response are read at the width each route needs.
export interface ReactRouterCarrier {
  readonly __args?: { readonly request: Request; readonly params: Params }
}

export const reactRouterCarrier: ReactRouterCarrier = {}

// `app` = deps, curried once. No `mw`: a loader and an action are the only
// two mount shapes React Router has, and neither is a middleware — each
// runs to completion on its own, once, for its own route.
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
