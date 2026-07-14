import { type Abort, httpError } from '@lntt/scope'
import type { TaggedError } from '../lib/errors.ts'

// Domain outcomes are RETURNED tagged errors; the codec only knows HTTP status.
// This one table is where a domain error's HTTP meaning lives for the handlers
// — a 422 for a validation reject, a 404 for a missing prefetch, a 401/429 for
// the auth outcomes. An unlisted tag degrades to 422 (a client-correctable
// input problem), never a 200.
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

// A RETURNED domain error → the matching status abort, its `_tag` as the body
// so the typed client can branch on the reason.
export const abortFor = (error: TaggedError): Abort =>
  httpError(STATUS_BY_TAG[error._tag] ?? 422, { error: error._tag })
