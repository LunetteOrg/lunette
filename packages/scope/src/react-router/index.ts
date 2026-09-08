// `@lntt/scope/react-router` — the React Router carrier and its two mounts.
//
// A carrier is `__args` alone. A loader and an action carry the same
// `{ request, params }` pair, so ONE carrier serves both — but they are two
// DISTINCT mount shapes and never a generic middleware: each runs to
// completion on its own, once, for its own route. That is why there is no
// `mw` here.
//
// `context` — React Router's own per-request bag — is deliberately left out of
// `__args`: a mount adds it back at the specific type it actually receives, the
// same way an Express route reads `Request`/`Response` at the width it needs.

import type { Params } from 'react-router'
import type { DepGuard, ResultOf, Scope, State } from '../index.ts'
import type { Validated } from '../route-gate.ts'
import { fetchReads } from '../reads.ts'

// `params` is React Router's own `Params`, whose values are `string |
// undefined` — the width a route really hands a loader. The carrier used to
// take what the scope said the route supplies
// (`reactRouterCarrier<Route.LoaderArgs['params']>()`), and it went the way the
// other three declarations went: what a scope reads of an entry is said
// by `.validate('params', schema, onError)`, once, per BRANCH.
//
// That last word is the reason, and it is sharper here than anywhere else. A
// type argument is fixed at `scope(carrier<X>())` — the FIRST call — so every
// branch of a scope inherits it, and one base value could not serve two routes
// reading different params. A verb is per branch, which is what makes a base
// scope a reusable unit at all.
//
// NO READ EXTENSION is needed for it, unlike Express and Hono: `params` is
// already what a run brings here, so `validate` has an entry to refine on the
// bare carrier.
export interface ReactRouterCarrier {
  readonly __args?: { readonly request: Request; readonly params: Params }
}

// PURE DECLARATION — the returned object carries nothing, and there is no type
// argument left for the call to make a claim with. It stays a call because one
// vocabulary should not have a carrier invoked beside a carrier that is not.
export const reactRouterCarrier = (): ReactRouterCarrier => ({})

// `loader` and `action` are the same wrapper twice, and stay two names on
// purpose: which one a route exports is what React Router reads, so collapsing
// them into one `mount` would hand the author a value that fits both slots and
// says nothing about which it is.
//
// THE MOUNT IS TRANSPARENT: it hands back what the SCOPE hands back, so
// `useLoaderData<typeof loader>()` and RR7's own typegen see the leaf's value.
// Declared `unknown` — which is what a wrapper writes by default — they would
// see `unknown` instead, and nothing at runtime would say so.
//
// A step that stops does so in React Router's own door — a THROWN `data(...)`
// or `redirect(...)`. A RETURNED `data(null, { status: 404 })` renders normally
// instead of reaching an ErrorBoundary, and nothing here guards against writing
// `return` by mistake: the mistake is at the call site, not at a missing check.
export const reactRouter = <App extends object>(deps: App) => {
  // `DepGuard` rides the scope argument: the deps were curried at
  // `reactRouter(deps)`, so a mount hands the scope its chain exactly as a
  // direct call does and owes the same verdict — without it, the mount would be
  // the one way to reach a scope while supplying less than it asks.
  //
  // THE PARAMS THE SCOPE VALIDATED RIDE THE MOUNT'S OWN PARAMETER, which is
  // what puts a route under a check here at all. React Router never hands
  // us a pattern — `routes.ts` owns that mapping — so there is nothing for a
  // gate of ours to read. What there IS, in an RR7 app, is the typegen: a route
  // module writes
  //
  //   export const loader = mountLoader(byId) satisfies (a: Route.LoaderArgs) => unknown
  //
  // and contravariance does the rest — a loader demanding `{ id: string }` does
  // not accept a route whose generated params say `{ slug: string }`. It is the
  // shape `procedure` uses on tRPC, for the same reason: where the framework
  // supplies the demand's counterpart itself, no gate of ours is needed.
  //
  // A scope that validates no params demands React Router's own wide `Params`
  // and fits any route, which is the safe direction and the common case.
  const mount =
    <S extends State>(sc: Scope<S> & DepGuard<App, S['need']>) =>
    (args: {
      readonly request: Request
      readonly params: Validated<S, 'params'>
    }): Promise<ResultOf<Scope<S>>> =>
      (sc as unknown as (app: App, a: object) => Promise<ResultOf<Scope<S>>>)(deps, args)

  return { loader: mount, action: mount }
}

// ── the read extensions ──────────────────────────────────────────────────────
// PLAIN STEPS, not verbs: these ADD a ctx entry, and a verb is what may REPLACE
// one (`@lntt/scope/guard`). The reasoning is written out in the Hono carrier;
// these two are the SAME FAMILY — both read a Fetch `Request` — so what differs
// is only where the request is found, and the readers themselves are shared.
export type { Query, Cookies, Headers_ as HeaderEntries, Encoding, BodyOf } from '../reads.ts'

// ONE implementation for the whole Fetch family, in `reads.ts` — Hono reads the
// same source through `c.req.raw`. This subpath passes the one line that
// differs. A loader has no body; an ACTION does, and the same factory serves
// both since the step reads whichever request the run brought.
const reads = fetchReads((ctx: { readonly request: Request }) => ctx.request)

export const query = reads.query
export const headers = reads.headers
export const cookies = reads.cookies
export const body = reads.body
