import { data as rr7Data } from 'react-router'
import { OK, type Ok } from '../abort.ts'
import type { RequestHead } from '../carrier.ts'
import type { Carrier } from '../scope.ts'

// THE REACT ROUTER CARRIER. It renders HTTP's words — a 404 is a 404 here —
// so it re-exports them rather than coining twins. What earns it its own
// carrier is the word NOTHING else can render: `data(value, { status })`, a
// React Router response value that only a loader or an action can return.
//
// That word is why deriving the category from behaviour was the wrong rule.
// This subpath once existed as a channel that coined nothing, and a scope using
// its escape hatch mounted happily on Hono, where the RR7 value it returned was
// serialised as a body. Declared a carrier, it coins `rr7-data`, and that mount
// is a compile error naming the intent.
export {
  forbidden,
  html,
  httpError,
  json,
  notFound,
  redirect,
  text,
  unauthorized,
  type HttpIntent,
  type Rendered,
  toResponse,
} from './http.ts'

// The intent `data()` coins, carrying React Router's own value untouched. It is
// an `Ok`, not an `Abort`: `data(v, { status: 201 })` is a SUCCESS that names
// its own shape, so it belongs on the side `json(v, 201)` is on.
export interface Rr7DataIntent {
  readonly kind: 'rr7-data'
  readonly value: unknown
}

// `data(value, init)` — React Router's escape hatch, wrapped so the choice is
// still made through this carrier's own subpath and still lands in the intent
// set. The wrapper is what makes it GATED: RR7's `data` imported directly from
// `'react-router'` at a call site would be an ordinary return value the intent
// axis never sees, and the mount could not refuse it anywhere.
// The init type is READ OFF React Router's own `data`, not restated: a
// hand-written `{ status?, headers? }` would be a second declaration to keep
// aligned with a dependency that owns the shape (and `HeadersInit` is a DOM
// name this package does not have).
export const data = <V>(
  value: V,
  init?: Parameters<typeof rr7Data>[1],
): Ok<V, { readonly 'rr7-data': true }> =>
  ({
    [OK]: true,
    value,
    intent: { kind: 'rr7-data', value: rr7Data(value, init) } satisfies Rr7DataIntent,
  }) as unknown as Ok<V, { readonly 'rr7-data': true }>

// React Router's THROWN `redirect` is deliberately NOT re-exported. A throw is
// infrastructure by the error convention (principle 3) and carries no intent,
// so it could be neither declared here nor refused at a mount — it would be the
// same ungated escape hatch this carrier exists to close. The RETURNED
// `redirect()` above renders identically on this host, through the codec.
export interface ReactRouterCarrier extends Carrier {
  readonly __ctx?: { readonly request: RequestHead }
  readonly __validatable?: { readonly params: Readonly<Record<string, string>> }
  readonly __seed?: {
    readonly request: RequestHead
    readonly params: Readonly<Record<string, string>>
  }
  // The same set HTTP admits, including BOTH body encodings: React Router's own
  // `FormEncType` includes `application/json` alongside the two form ones, so a
  // JSON-submitting `fetcher.submit` and an HTML `<Form>` are both things an
  // action really receives.
  readonly __admits?: {
    readonly body: true
    readonly query: true
    readonly 'request-headers': true
    readonly 'set-cookie': true
    readonly 'response-headers': true
  }
  // HTTP's three, plus its own. `rr7-data` is what no other host renders.
  readonly __declares?: {
    readonly status: true
    readonly redirect: true
    readonly 'ok-status': true
    readonly 'rr7-data': true
  }
}

// Pure declaration: `ctx.request` is read off the carrier, the route params are
// the host-supplied entry, and `data()` is a free function like every other
// word. Nothing to seed at runtime.
export const reactRouter = {} as unknown as ReactRouterCarrier
