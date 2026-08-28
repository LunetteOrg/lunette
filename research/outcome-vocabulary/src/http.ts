// THE HTTP CARRIER. It owns its whole vocabulary — the verb that names its
// input (`params`, because on HTTP that is what the input IS), the words that
// stop the fold, and the words that shape a success. Nothing here is in the
// core, and the core knows none of these names.
import { ABORT, type Abort, type Issue, OK, type Ok, type Outcome, type RequestHead } from './kernel.ts'
import type { Schema, ScopeExtension, ScopeExtensionValue } from './scope.ts'

// ── the vocabulary ───────────────────────────────────────────────────────────
// Each verb carries its own name in the type. That is the whole mechanism:
// nothing is declared by hand, the declaration IS what you returned.
export type HttpIntent =
  | { readonly kind: 'redirect'; readonly location: string; readonly status: number }
  | { readonly kind: 'status'; readonly status: number; readonly body?: unknown }
  | { readonly kind: 'ok'; readonly status: number; readonly contentType: string }

const abort = <I extends object>(intent: HttpIntent): Abort<I> =>
  ({ [ABORT]: true, intent }) as Abort<I>

export const httpError = (status: number, body?: unknown): Abort<{ status: true }> =>
  abort({ kind: 'status', status, ...(body === undefined ? {} : { body }) })

export const notFound = (body?: unknown): Abort<{ status: true }> => httpError(404, body)
export const forbidden = (body?: unknown): Abort<{ status: true }> => httpError(403, body)
export const unauthorized = (body?: unknown): Abort<{ status: true }> => httpError(401, body)
export const tooManyRequests = (body?: unknown): Abort<{ status: true }> => httpError(429, body)

// `redirect` is the word with NO equivalent anywhere else. It is why the
// vocabulary belongs to the carrier rather than being shared: an RPC host has
// nothing to translate it into, and today it degrades in silence.
export const redirect = (location: string, status = 302): Abort<{ redirect: true }> =>
  abort({ kind: 'redirect', location, status })

// The success side gets its OWN intent name. Sharing `status` with the abort
// side would let a host that declares "I translate status aborts into my own
// error codes" silently accept a 201 it cannot express.
export const json = <V>(value: V, status = 200): Ok<V, { 'ok-status': true }> => ({
  [OK]: true,
  value,
  intent: { kind: 'ok', status, contentType: 'application/json' },
})

export const html = (markup: string, status = 200): Ok<string, { 'ok-status': true }> => ({
  [OK]: true,
  value: markup,
  intent: { kind: 'ok', status, contentType: 'text/html; charset=utf-8' },
})

// ── the extension ────────────────────────────────────────────────────────────
export interface HttpExtension extends ScopeExtension {
  // The carrier exposes what IT has. There is no shared `request` extension:
  // `RequestHead` is a core TYPE, and every carrier that holds one puts it on
  // its own ctx — which is why a read-only guard typed against `RequestHead`
  // still works on any of them.
  readonly __ctx?: { readonly request: RequestHead }
  readonly __declares?: {
    readonly status: true
    readonly redirect: true
    readonly 'ok-status': true
  }
  // The INPUT verb, named for what it is on this carrier.
  params<T, Self = this>(schema: Schema<T>): Self & { readonly __params?: T }
}

const emptyHead: RequestHead = { url: '/', method: 'GET', headers: new Map() }

const runtime: ScopeExtensionValue = {
  ctx: { request: emptyHead },
  methods(state, rebuild) {
    return {
      params(schema: Schema<unknown>) {
        return rebuild({ ...state, schema })
      },
    }
  },
}

export const http = runtime as unknown as HttpExtension

// ── the codec ────────────────────────────────────────────────────────────────
// THREE cases. The `invalid` branch is not optional and not a convention: drop
// it and this function stops compiling, because the union is not exhausted.
// Notice where 422 is decided — here, by HTTP, not by the fold.
export interface Rendered {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

export const toResponse = (outcome: Outcome<unknown>): Rendered => {
  if (outcome.ok) {
    const intent = outcome.intent as HttpIntent | undefined
    const status = intent?.kind === 'ok' ? intent.status : 200
    const contentType = intent?.kind === 'ok' ? intent.contentType : 'application/json'
    if (status === 204) return { status, headers: {}, body: null }
    return {
      status,
      headers: { 'content-type': contentType },
      body: contentType.startsWith('text/')
        ? String(outcome.value)
        : JSON.stringify(outcome.value),
    }
  }

  if ('invalid' in outcome) {
    // 422 and not 400, so it stays distinguishable from a host's own native
    // validator. THIS is the line that used to live in the core.
    return {
      status: 422,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issues: outcome.invalid.issues satisfies readonly Issue[] }),
    }
  }

  const intent = outcome.abort.intent as HttpIntent
  if (intent.kind === 'redirect') {
    return { status: intent.status, headers: { location: intent.location }, body: null }
  }
  if (intent.kind === 'ok') {
    return { status: intent.status, headers: {}, body: null }
  }
  return intent.body === undefined
    ? { status: intent.status, headers: {}, body: null }
    : {
        status: intent.status,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(intent.body),
      }
}
