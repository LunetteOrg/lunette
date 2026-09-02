import type { Passed, Word } from '../index.ts'
import type { HttpResponse, HttpStatus, Redirect } from './http.ts'
import type { RequestHead } from './request-head.ts'

// THE REACT ROUTER CARRIER. It is an HTTP host, so it speaks HTTP's words and
// re-exports them below rather than coining lookalikes — a 404 does not differ
// here, and a carrier that redeclared one would make the same condition two
// incompatible words.
//
// What earns it a carrier of its own is ONE word: a value handed back through
// React Router's own data pipeline, which no other host can render. That is
// said as a WORD and not as a plain return value, and the difference is the
// whole point — a word carries an intent, so a host that cannot render it fails
// to MOUNT, while a plain value would carry nothing, mount clean on Hono, and
// break at runtime.
//
// This file imports NOTHING from `react-router`, and does not need to: a word
// is a declaration carrying its arguments, and calling RR7's own `data()` is
// the mount's job (#58), exactly as rendering a 404 is. Which keeps this
// package at zero dependencies and keeps a scope written here readable by a
// test that has no router in it.
//
// The OTHER escape hatch — RR7's thrown `redirect()` — is deliberately not
// modelled. A thrown value is infrastructure by this library's error
// convention, so the fold lets it through untouched and the type system never
// sees it. A scope wanting a redirect the types can read RETURNS `redirect()`,
// the word below, and the mount calls RR7's function.

export type { RequestHead }

// ── HTTP's words, unchanged ──────────────────────────────────────────────────
// Re-exported so a scope on this carrier imports from ONE subpath, the way
// every other carrier's vocabulary is reached.
export {
  forbidden,
  html,
  httpError,
  json,
  notFound,
  redirect,
  response,
  text,
  unauthorized,
  type HttpResponse,
  type HttpStatus,
  type Redirect,
  type RedirectStatus,
  type ResponseInit,
} from './http.ts'

// ── and the one word that is this carrier's own ──────────────────────────────
// `value` is top-level for `HttpResponse`'s reason: it is the APP's object, and
// that is what the read-only view has to reach.
export interface RouterData<V> extends Word<{ readonly 'rr-data': true }> {
  readonly kind: 'rr-data'
  readonly intent: { readonly status: number }
  readonly value: V
}

export const data = <V>(value: V, status = 200): RouterData<V> => ({
  kind: 'rr-data',
  intent: { status },
  value,
})

// ── reaching what came back ──────────────────────────────────────────────────
// The carrier's ONE assertion. It has TWO words carrying a domain object —
// HTTP's success word and `data` — so the read-only view has two places to
// reach into. Missing either leaves a decorator free to write through the app's
// own object on the branch a real run takes.
export type Answered<V> = Readonly<
  HttpStatus | Redirect | HttpResponse<Readonly<V>> | RouterData<Readonly<V>> | V
>

export const answered = <V>(passed: Passed): Answered<V> => passed as unknown as Answered<V>

export const isWord = (
  x: unknown,
): x is HttpStatus | Redirect | HttpResponse<unknown> | RouterData<unknown> =>
  typeof x === 'object' && x !== null && 'intent' in x && 'kind' in x

// ── the carrier's VOCABULARY ─────────────────────────────────────────────────
export interface ReactRouterCarrier {
  readonly __args?: {
    readonly request: RequestHead
    readonly params: Readonly<Record<string, string>>
  }
  readonly __vocabulary?: {
    readonly status: true
    readonly redirect: true
    readonly 'ok-status': true
    readonly 'rr-data': true
  }
}

// PURE DECLARATION — no runtime value at all.
export const reactRouter = {} as ReactRouterCarrier
