import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ABORT, OK, type Abort, type Ok } from '../abort.ts'
import type { Outcome, RequestHead } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue, Sink } from '../scope.ts'

// THE HTTP CARRIER. It owns its whole vocabulary — the verb that names its
// input (`.params`, because on HTTP that is what the input IS: route params),
// the words that stop the fold, and the words that shape a success. Nothing
// here is in the core, and the core knows none of these names (§ the core
// coins no vocabulary).

// ── the vocabulary ───────────────────────────────────────────────────────────
// Each verb carries its own name in the type. That is the whole mechanism:
// nothing is declared by hand — the declaration IS what a guard/leaf returned.
export type HttpIntent =
  | { readonly kind: 'redirect'; readonly location: string; readonly status: number }
  | { readonly kind: 'status'; readonly status: number; readonly body?: unknown }
  | { readonly kind: 'ok'; readonly status: number; readonly contentType: string }

const abort = <I extends object>(intent: HttpIntent): Abort<I> =>
  ({ [ABORT]: true, intent }) as unknown as Abort<I>

export const httpError = (status: number, body?: unknown): Abort<{ readonly status: true }> =>
  abort(body === undefined ? { kind: 'status', status } : { kind: 'status', status, body })

export const notFound = (body?: unknown): Abort<{ readonly status: true }> => httpError(404, body)
export const forbidden = (body?: unknown): Abort<{ readonly status: true }> => httpError(403, body)
export const unauthorized = (body?: unknown): Abort<{ readonly status: true }> =>
  httpError(401, body)

// `redirect` is the word with NO equivalent anywhere else. It is why the
// vocabulary belongs to the carrier rather than being shared: an RPC host has
// nothing to translate it into, and it must be its OWN declared intent —
// sharing `status`'s name would let a host that renders status aborts silently
// accept a redirect it cannot express.
export const redirect = (location: string, status = 302): Abort<{ readonly redirect: true }> =>
  abort({ kind: 'redirect', location, status })

// ── the success side gets its OWN intent name ────────────────────────────────
// `json(v, 201)` does NOT reuse the abort side's `status`: sharing it would let
// a host that legitimately declares "I translate status aborts into my own
// error codes" (an RPC carrier does — `notFound()` → a thrown error code)
// silently accept a 201 success status it has nowhere to put.
const ok = <V>(value: V, status: number, contentType: string): Ok<V, { readonly 'ok-status': true }> =>
  ({ [OK]: true, value, intent: { kind: 'ok', status, contentType } }) as unknown as Ok<
    V,
    { readonly 'ok-status': true }
  >

export const json = <V>(value: V, status = 200): Ok<V, { readonly 'ok-status': true }> =>
  ok(value, status, 'application/json')

export const html = (markup: string, status = 200): Ok<string, { readonly 'ok-status': true }> =>
  ok(markup, status, 'text/html; charset=utf-8')

export const text = (value: string, status = 200): Ok<string, { readonly 'ok-status': true }> =>
  ok(value, status, 'text/plain; charset=utf-8')

// ── the extension ────────────────────────────────────────────────────────────
// What `.status(n)` deposits: a per-scope DEFAULT status, read back the same
// way `cookies`/`headers` read their sinks — through a reader exported next to
// it, `readDefaultStatus`. A per-outcome verb (`json(v, 201)`) always wins over
// this default; it exists for the common case of a leaf that returns a plain
// value and still wants a status other than 200/201.
export interface HttpEffect {
  readonly httpStatus: number | undefined
}

export interface HttpExtension extends ScopeExtension {
  // The carrier exposes what IT has. There is no shared `request` extension in
  // this file — `RequestHead` is a core TYPE, and every carrier that holds one
  // puts it on its own ctx, which is why a read-only guard typed against
  // `RequestHead` still works whichever carrier is in play.
  readonly __ctx?: { readonly request: RequestHead }
  readonly __declares?: {
    readonly status: true
    readonly redirect: true
    readonly 'ok-status': true
  }
  readonly __effects?: HttpEffect
  readonly __methods?: { readonly params: true; readonly status: true }

  // The INPUT verb, named for what it is on this carrier: route params. `X` is
  // the schema itself (not just its output `T`), the same way the core's
  // former `.input` preserved it — `Handler.schema` is read by the MOUNTS for
  // the host's native validator (`sValidator('param', handler.schema)`), so
  // widening to the bare `StandardSchemaV1` interface here would erase exactly
  // what they need.
  params<X extends StandardSchemaV1, Self = this>(
    this: Self,
    schema: X,
  ): Self & { readonly __schema?: X }

  // The route's DEFAULT success status, kept as the literal `N` in the type so
  // a host's native codec can pin its response union to it
  // (`InferResponseType<call, 201>`). A `json(v, 201)`/`html`/`text` call on a
  // given leaf always overrides it.
  status<N extends number, Self = this>(
    this: Self,
    n: N,
  ): Self & { readonly __effects?: { readonly httpStatus: N } }
}

// `ctx.request` needs no runtime seeding here: unlike `cookies`/`headers` (which
// WRITE into a sink the fold creates), `request` is READ off the carrier the
// host hands to `runFold` — `{ request }` (`RequestCarrier`, `carrier.ts`) is
// already merged into `ctx` before any guard runs. This extension's job is
// only to widen the TYPE (`__ctx`), the same way `extensions/request.ts` does.
const httpStatusSink =
  (status: number): (() => Sink) =>
  () => ({ key: 'httpStatus', ctx: undefined, collect: () => status })

const runtime: ScopeExtensionValue = {
  methods(state, rebuild) {
    return {
      params(schema: StandardSchemaV1) {
        return rebuild({ ...state, schema })
      },
      status(n: number) {
        return rebuild({ ...state, sinks: [...state.sinks, httpStatusSink(n)] })
      },
    }
  },
}

export const http = runtime as unknown as HttpExtension

// The reader, exported next to `.status()` so the cast lives HERE and not in
// every host pack. A scope that never called `.status()` collected nothing.
export const readDefaultStatus = (outcome: Outcome<unknown, object>): number | undefined =>
  (outcome.effects as Partial<HttpEffect>).httpStatus

// ── the codec ────────────────────────────────────────────────────────────────
// THREE cases, matching `Outcome`'s three branches. The `invalid` case is not
// optional and not a convention: drop it and this function stops compiling,
// because the union is not exhausted. Notice where 422 is decided — HERE, by
// HTTP, not by the fold (`validate.ts` only ever returns the issues).
export interface Rendered {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

export const toResponse = (outcome: Outcome<unknown, object>): Rendered => {
  if (outcome.ok) {
    const intent = outcome.intent as HttpIntent | undefined
    const status = intent?.kind === 'ok' ? intent.status : (readDefaultStatus(outcome) ?? 200)
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
    // 422, and not Hono's native `sValidator` 400 (`validate.ts`'s note) — the
    // codec's choice, made HERE, where the host is already known.
    return {
      status: 422,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issues: outcome.invalid.issues }),
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
