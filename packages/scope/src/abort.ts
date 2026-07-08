// An abort is a RETURNED domain value (the error convention), not a throw:
// a guard or leaf hands one back to short-circuit the scope, and the host's
// codec maps it to a response (redirect / 4xx). A THROW stays infrastructure
// (5xx) and is never an abort.

const ABORT: unique symbol = Symbol('scope.abort')

export type ResponseIntent =
  | { readonly kind: 'redirect'; readonly location: string; readonly status: number }
  | { readonly kind: 'status'; readonly status: number; readonly body?: unknown }

export interface Abort {
  readonly [ABORT]: true
  readonly intent: ResponseIntent
}

export const redirect = (location: string, status = 302): Abort => ({
  [ABORT]: true,
  intent: { kind: 'redirect', location, status },
})

export const httpError = (status: number, body?: unknown): Abort => ({
  [ABORT]: true,
  intent: body === undefined ? { kind: 'status', status } : { kind: 'status', status, body },
})

export const unauthorized = (body?: unknown): Abort => httpError(401, body)
export const forbidden = (body?: unknown): Abort => httpError(403, body)
export const notFound = (body?: unknown): Abort => httpError(404, body)

export const isAbort = (x: unknown): x is Abort =>
  typeof x === 'object' && x !== null && ABORT in x
