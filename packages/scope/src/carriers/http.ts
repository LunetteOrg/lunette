import type { Passed, Word } from '../index.ts'
import type { RequestHead } from './request-head.ts'

// THE HTTP CARRIER — the protocol FAMILY, not the host. Hono, Express and a
// hand-wired `node:http` all pick this one, because they render the same words;
// there is no `.extend(hono)`.
//
// What a carrier is, in three parts, none of them the core's:
//
//   what a run BRINGS      — the request and the params the router matched
//   the WORDS it coins     — types of its own, and the values that build them
//   its VOCABULARY         — the intents those words carry, read by the gate
//
// Nothing here is imported from the core but two TYPES, and types vanish — so
// at runtime a word is a plain object this file wrote.

export type { RequestHead }

// ── the words ────────────────────────────────────────────────────────────────
// Each carries its own NAME in its type, and the payload rides `intent`, typed.
// `Word` declares `intent: unknown` because the core never reads what an intent
// MEANS; a carrier narrows it, because its mount does.

// FOUR constructors, ONE intent name. What a host must know how to render is a
// status line, and these differ in the number they carry, not in what rendering
// them takes.
export interface HttpStatus extends Word<{ readonly status: true }> {
  readonly kind: 'status'
  readonly intent: { readonly status: number; readonly message?: string }
}

// `message` is spread in only when it was given: under
// `exactOptionalPropertyTypes` an explicit `undefined` is not the same as an
// absent key, and the mount reads the difference.
const status = (code: number, message?: string): HttpStatus => ({
  kind: 'status',
  intent: { status: code, ...(message === undefined ? {} : { message }) },
})

export const notFound = (message?: string): HttpStatus => status(404, message)
export const unauthorized = (message?: string): HttpStatus => status(401, message)
export const forbidden = (message?: string): HttpStatus => status(403, message)
// The open one, for a status the three named above do not cover.
export const httpError = (code: number, message?: string): HttpStatus => status(code, message)

// A word with its OWN name, and that is the whole reason it is not a status. A
// host may render status refusals and have nowhere to send the caller — an RPC
// reply, a rendered island — and sharing `status` would let such a host accept
// a redirect it cannot express.
export type RedirectStatus = 301 | 302 | 303 | 307 | 308

export interface Redirect extends Word<{ readonly redirect: true }> {
  readonly kind: 'redirect'
  readonly intent: { readonly location: string; readonly status: RedirectStatus }
}

export const redirect = (location: string, code: RedirectStatus = 302): Redirect => ({
  kind: 'redirect',
  intent: { location, status: code },
})

// The SUCCESS side, and its name is its own for the mirror of the redirect's
// reason: a host may render a refusal and have nowhere to put a success status
// or a header, and a shared name would let it accept one silently.
//
// `value` is top-level rather than inside `intent`, because it is the APP's own
// object rather than something this carrier composed — which is exactly what
// `Answered` has to reach when it makes the way out read-only.
export interface HttpResponse<V> extends Word<{ readonly 'ok-status': true }> {
  readonly kind: 'response'
  readonly intent: {
    readonly status: number
    readonly headers: Readonly<Record<string, string>>
  }
  readonly value: V
}

export interface ResponseInit {
  readonly status?: number
  readonly headers?: Readonly<Record<string, string>>
}

export const response = <V>(value: V, init: ResponseInit = {}): HttpResponse<V> => ({
  kind: 'response',
  intent: { status: init.status ?? 200, headers: init.headers ?? {} },
  value,
})

// SUGAR, not new words: each coins `ok-status` like the plain one and differs
// only in the content type it presets. A caller's own `content-type` wins —
// these set a default, they do not overrule what was asked for.
const typed = <V>(value: V, contentType: string, init: ResponseInit): HttpResponse<V> =>
  response(value, {
    ...init,
    headers: { 'content-type': contentType, ...(init.headers ?? {}) },
  })

export const json = <V>(value: V, init: ResponseInit = {}): HttpResponse<V> =>
  typed(value, 'application/json; charset=utf-8', init)

export const html = (markup: string, init: ResponseInit = {}): HttpResponse<string> =>
  typed(markup, 'text/html; charset=utf-8', init)

export const text = (body: string, init: ResponseInit = {}): HttpResponse<string> =>
  typed(body, 'text/plain; charset=utf-8', init)

// ── reaching what came back ──────────────────────────────────────────────────
// `next` hands back a `Passed`, which says nothing on purpose: when a step is
// written, the steps it will wrap do not exist yet. A step that DECORATES has
// to read it anyway, and the reading is the CARRIER's — it knows which words
// can be in there and the core does not. ONE assertion, written here, never at
// each step.
//
// It hands back a READ-ONLY view, which is this carrier doing on the way out
// what `Ctx` does on the way in. The core cannot: where `next` is typed there
// is no type yet to make read-only.
//
// `HttpResponse<Readonly<V>>` and not `HttpResponse<V>`: the outer `Readonly`
// reaches `value` and stops, and `value` is where a success carries the app's
// own object — which is the branch a real run takes, and the one a decorator
// writes through. Wrapping only the bare branch protects the case that was
// already safe.
//
// It does not COPY, and must not: cloning what came back loses a class's
// prototype and THROWS on a response or a stream, and by the error convention a
// throw is infrastructure — so a defensive clone would turn a successful run
// into a retry. The view is a statement about who may write, not a wall.
export type Answered<V> = Readonly<HttpStatus | Redirect | HttpResponse<Readonly<V>> | V>

export const answered = <V>(passed: Passed): Answered<V> => passed as unknown as Answered<V>

// This carrier's own predicate. The core ships none — it knows nothing about
// what a word looks like here — so telling a word from a domain value is the
// carrier's job.
export const isWord = (x: unknown): x is HttpStatus | Redirect | HttpResponse<unknown> =>
  typeof x === 'object' && x !== null && 'intent' in x && 'kind' in x

// ── the carrier's VOCABULARY ─────────────────────────────────────────────────
// What the gate reads a returned word against. A word this carrier does not
// coin is an error where the step is WRITTEN, not where the scope is mounted.
export interface HttpCarrier {
  readonly __args?: {
    readonly request: RequestHead
    readonly params: Readonly<Record<string, string>>
  }
  readonly __vocabulary?: {
    readonly status: true
    readonly redirect: true
    readonly 'ok-status': true
  }
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`, and
// never a step.
export const http = {} as HttpCarrier
