import type { Abort } from '@lntt/scope'
import { httpError } from '@lntt/scope/http'
import * as rpc from '@lntt/scope/trpc'
import type { RpcCode } from '@lntt/scope/trpc'
import type { TaggedError } from '../lib/errors.ts'

// Domain outcomes are RETURNED tagged errors; the codec only knows HTTP status
// (or, on tRPC, its own code). Each carrier's vocabulary belongs to that
// carrier alone (§ the core coins no vocabulary), so a shared "semantic" abort
// across host families would be HTTP in disguise — this table is where a
// domain error's HTTP meaning lives, and `CODE_BY_TAG` below is where the SAME
// domain error's tRPC meaning lives, independently. An unlisted tag degrades
// to the closest "client-correctable input" outcome (422 / UNPROCESSABLE_
// CONTENT), never a success.
const STATUS_BY_TAG: Record<string, number> = {
  PostTitleRequired: 422,
  PostBodyRequired: 422,
  CommentBodyRequired: 422,
  BodyImageRejected: 422,
  PostNotFound: 404,
  ParentCommentNotFound: 404,
  OtpInvalid: 401,
  OtpExpired: 401,
  OtpMaxAttemptsExceeded: 429,
  RegistrationRequired: 422,
}

// A RETURNED domain error → the matching HTTP status abort, its `_tag` as the
// body so the typed client can branch on the reason.
export const httpAbortFor = (error: TaggedError): Abort<{ readonly status: true }> =>
  httpError(STATUS_BY_TAG[error._tag] ?? 422, { error: error._tag })

const CODE_BY_TAG: Record<string, RpcCode> = {
  PostTitleRequired: 'UNPROCESSABLE_CONTENT',
  PostBodyRequired: 'UNPROCESSABLE_CONTENT',
  CommentBodyRequired: 'UNPROCESSABLE_CONTENT',
  BodyImageRejected: 'UNPROCESSABLE_CONTENT',
  PostNotFound: 'NOT_FOUND',
  ParentCommentNotFound: 'NOT_FOUND',
  OtpInvalid: 'UNAUTHORIZED',
  OtpExpired: 'UNAUTHORIZED',
  OtpMaxAttemptsExceeded: 'TOO_MANY_REQUESTS',
  RegistrationRequired: 'UNPROCESSABLE_CONTENT',
}

// The tRPC-mounted twin: the SAME table, in tRPC's own words — a thrown
// `TRPCError` code, not a status line. `@lntt/integration/trpc`'s
// `abortToTRPCError` is the one place this becomes an exception.
export const rpcAbortFor = (error: TaggedError): Abort<{ readonly code: true }> =>
  (
    {
      NOT_FOUND: rpc.notFound,
      UNAUTHORIZED: rpc.unauthorized,
      FORBIDDEN: rpc.forbidden,
      CONFLICT: rpc.conflict,
      TOO_MANY_REQUESTS: rpc.tooManyRequests,
      UNPROCESSABLE_CONTENT: rpc.unprocessableContent,
    } satisfies Record<RpcCode, (message?: string) => Abort<{ readonly code: true }>>
  )[CODE_BY_TAG[error._tag] ?? 'UNPROCESSABLE_CONTENT'](error._tag)
