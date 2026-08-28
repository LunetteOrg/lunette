// THE RPC CARRIER. Its vocabulary overlaps HTTP's in MEANING but not in words,
// and that is the point: `notFound()` here produces an RPC code, not a 404, and
// there is no `redirect` at all because an RPC call has nowhere to go.
//
// Today's code translates HTTP statuses into RPC codes with a lookup table.
// That translation is incidental — it works because someone wrote the six
// entries that happened to line up. Here it is not needed: each carrier says
// its own word, and a scope that says HTTP's word does not mount here.
import { ABORT, type Abort, type Outcome, type RequestHead } from './kernel.ts'
import type { Schema, ScopeExtension, ScopeExtensionValue } from './scope.ts'

export type RpcCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'UNPROCESSABLE_CONTENT'

export interface RpcIntent {
  readonly kind: 'code'
  readonly code: RpcCode
  readonly message?: string
}

const abort = (code: RpcCode, message?: string): Abort<{ code: true }> =>
  ({
    [ABORT]: true,
    intent: { kind: 'code', code, ...(message === undefined ? {} : { message }) },
  }) as Abort<{ code: true }>

export const notFound = (message?: string): Abort<{ code: true }> => abort('NOT_FOUND', message)
export const unauthorized = (message?: string): Abort<{ code: true }> =>
  abort('UNAUTHORIZED', message)
export const forbidden = (message?: string): Abort<{ code: true }> => abort('FORBIDDEN', message)
export const conflict = (message?: string): Abort<{ code: true }> => abort('CONFLICT', message)
export const tooManyRequests = (message?: string): Abort<{ code: true }> =>
  abort('TOO_MANY_REQUESTS', message)

// ── the extension ────────────────────────────────────────────────────────────
export interface RpcExtension extends ScopeExtension {
  // tRPC's context holds a `Request` too, so this carrier offers one as well.
  // Same type, different owner — no shared extension in the middle.
  readonly __ctx?: { readonly request: RequestHead }
  readonly __declares?: { readonly code: true }
  // On RPC the input IS the payload — a different channel from HTTP's route
  // params, so it gets a different name rather than one verb meaning two things.
  input<T, Self = this>(schema: Schema<T>): Self & { readonly __params?: T }
}

const emptyHead: RequestHead = { url: '/', method: 'POST', headers: new Map() }

const runtime: ScopeExtensionValue = {
  ctx: { request: emptyHead },
  methods(state, rebuild) {
    return {
      input(schema: Schema<unknown>) {
        return rebuild({ ...state, schema })
      },
    }
  },
}

export const rpc = runtime as unknown as RpcExtension

// ── the codec ────────────────────────────────────────────────────────────────
export class RpcError extends Error {
  constructor(readonly code: RpcCode, message?: string) {
    super(message ?? code)
    this.name = 'RpcError'
  }
}

// A RETURNED abort becomes a THROWN error here: the one convention-translation
// point, because on RPC the error channel to the client IS the exception.
export const toRpcResult = <R>(outcome: Outcome<R>): R => {
  if (outcome.ok) return outcome.value
  if ('invalid' in outcome) {
    // The third branch again — RPC decides it is UNPROCESSABLE_CONTENT, and the
    // core never had an opinion.
    throw new RpcError(
      'UNPROCESSABLE_CONTENT',
      outcome.invalid.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    )
  }
  const intent = outcome.abort.intent as RpcIntent
  throw new RpcError(intent.code, intent.message)
}
