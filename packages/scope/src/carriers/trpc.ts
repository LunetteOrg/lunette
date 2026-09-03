import type { Passed, Word } from '../index.ts'
import type { RequestHead } from './request-head.ts'

// THE RPC CARRIER. Its vocabulary overlaps HTTP's in MEANING and in nothing
// else, and that is the point: `notFound()` here produces an RPC code, not a
// 404, and there is no redirect at all — an RPC reply has nowhere to send the
// caller.
//
// It names its own way in, as every carrier does: `input` where HTTP has
// `params`, because on RPC the input IS the whole payload. One word, one
// channel — never one verb meaning two things.

export type { RequestHead }

// ── the word ─────────────────────────────────────────────────────────────────
// ONE word, six constructors. Every one of them becomes a thrown `TRPCError` at
// the mount — tRPC has a single abort channel where HTTP has a status line — so
// a host that can render one of these renders all of them, and splitting the
// declared name would buy a refusal nobody could ever want. `http` splits
// `redirect` off for exactly the opposite reason: there, a host really can
// render a status and not a redirect.
export type RpcCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'UNPROCESSABLE_CONTENT'

export interface RpcAbort extends Word<{ readonly code: true }> {
  readonly kind: 'code'
  readonly intent: { readonly code: RpcCode; readonly message?: string }
}

const abort = (code: RpcCode, message?: string): RpcAbort => ({
  kind: 'code',
  intent: { code, ...(message === undefined ? {} : { message }) },
})

export const notFound = (message?: string): RpcAbort => abort('NOT_FOUND', message)
export const unauthorized = (message?: string): RpcAbort => abort('UNAUTHORIZED', message)
export const forbidden = (message?: string): RpcAbort => abort('FORBIDDEN', message)
export const conflict = (message?: string): RpcAbort => abort('CONFLICT', message)
export const tooManyRequests = (message?: string): RpcAbort => abort('TOO_MANY_REQUESTS', message)
// For a validity problem a guard discovers itself, past whatever schema the
// call already went through.
export const unprocessableContent = (message?: string): RpcAbort =>
  abort('UNPROCESSABLE_CONTENT', message)

// There is NO success word here, and the absence is a statement rather than an
// omission. An RPC reply IS the returned value: no status line to annotate, no
// headers to set, nowhere for a `json(v, 201)` to land. So a step on this
// carrier returns its value plainly, and `http`'s `ok-status` is refused where
// it is written (pinned in `trpc.test-d.ts`).

// ── reaching what came back ──────────────────────────────────────────────────
// The carrier's ONE assertion, for the same reason `http` has one: `next` hands
// back a `Passed`, and only the carrier knows which words can be in there.
//
// Shorter than `http`'s by exactly the branch this carrier does not have. There
// is no success word, so there is no domain object nested inside one — the
// outer `Readonly` reaches the value directly, and there is nothing further in.
export type Answered<V> = Readonly<RpcAbort | V>

export const answered = <V>(passed: Passed): Answered<V> => passed as unknown as Answered<V>

// `kind` is read against the one name this carrier coins, not merely checked for
// presence: a domain object carrying both names by coincidence would otherwise
// be claimed as a word and thrown at the mount as a `TRPCError` (§14).
export const isWord = (x: unknown): x is RpcAbort =>
  typeof x === 'object' &&
  x !== null &&
  'intent' in x &&
  'kind' in x &&
  x.kind === 'code'

// ── the carrier's VOCABULARY ─────────────────────────────────────────────────
export interface RpcCarrier {
  readonly __args?: {
    readonly request: RequestHead
    // `unknown` until something narrows it. Validation is per carrier and
    // arrives with #64; a shape guessed here would be a claim this file cannot
    // keep.
    readonly input: unknown
  }
  readonly __vocabulary?: { readonly code: true }
}

// PURE DECLARATION — no runtime value at all.
export const trpc = {} as RpcCarrier
