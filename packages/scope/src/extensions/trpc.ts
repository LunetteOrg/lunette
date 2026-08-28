import type { StandardSchemaV1 } from '@standard-schema/spec'
import { ABORT, type Abort } from '../abort.ts'
import type { RequestHead } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue } from '../scope.ts'

// THE RPC CARRIER. Its vocabulary overlaps HTTP's in MEANING but not in
// words, and that is the point: `notFound()` here produces an RPC code, not
// a 404, and there is no `redirect` at all — an RPC reply has nowhere to go.
// Every word below becomes a THROWN `TRPCError` at the codec
// (`@lntt/integration/trpc`'s `abortToTRPCError`), which is the ONE
// convention-translation point tRPC needs: it has a single abort channel, an
// exception, where HTTP has a status line.

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

// Every constructor coins the SAME declared name, `code` — unlike `http`,
// which splits `redirect` from `status` because a host might render one and
// not the other. Here every word ends at the one translation point (a thrown
// `TRPCError`), so splitting the declared name would buy nothing: a host
// that renders this carrier's vocabulary at all renders all of it.
const abort = (code: RpcCode, message?: string): Abort<{ readonly code: true }> =>
  ({
    [ABORT]: true,
    intent: { kind: 'code', code, ...(message === undefined ? {} : { message }) },
  }) as unknown as Abort<{ readonly code: true }>

export const notFound = (message?: string): Abort<{ readonly code: true }> => abort('NOT_FOUND', message)
export const unauthorized = (message?: string): Abort<{ readonly code: true }> =>
  abort('UNAUTHORIZED', message)
export const forbidden = (message?: string): Abort<{ readonly code: true }> => abort('FORBIDDEN', message)
export const conflict = (message?: string): Abort<{ readonly code: true }> => abort('CONFLICT', message)
export const tooManyRequests = (message?: string): Abort<{ readonly code: true }> =>
  abort('TOO_MANY_REQUESTS', message)
// A guard/leaf's OWN way to raise the same code the core's `invalid` branch
// renders automatically on a schema failure (`@lntt/integration/trpc`'s
// codec) — for a validity problem a guard discovers itself, past the schema.
export const unprocessableContent = (message?: string): Abort<{ readonly code: true }> =>
  abort('UNPROCESSABLE_CONTENT', message)

export interface RpcExtension extends ScopeExtension {
  // tRPC's context holds a `Request` too (the same shape HTTP hosts carry),
  // so this carrier offers `ctx.request` the same way `http` does — same
  // TYPE, different owner, no shared extension in the middle.
  readonly __ctx?: { readonly request: RequestHead }
  readonly __declares?: { readonly code: true }
  readonly __methods?: { readonly input: true }

  // The INPUT verb, named for what it is on THIS carrier: on RPC the input
  // IS the whole payload, a different channel from HTTP's route params, so it
  // gets its own name rather than one verb meaning two things. `X` is the
  // schema itself (not just its output `T`) — `handler.schema` is what the
  // mount hands to tRPC's native `.input(...)`, so narrowing here would erase
  // exactly what the mount needs.
  input<X extends StandardSchemaV1, Self = this>(
    this: Self,
    schema: X,
  ): Self & { readonly __schema?: X }
}

const runtime: ScopeExtensionValue = {
  methods(state, rebuild) {
    return {
      input(schema: StandardSchemaV1) {
        return rebuild({ ...state, schema })
      },
    }
  },
}

export const rpc = runtime as unknown as RpcExtension
